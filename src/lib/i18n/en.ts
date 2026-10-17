/**
 * English.
 *
 * The one locale that is not Devanagari, which changes two things:
 *
 * 1. Numerals are ASCII — `027`, not `०२७` — because English readers scan
 *    Western digits faster and the token is the one number that must never be
 *    misread.
 * 2. Counts inflect properly, `1 patient` / `3 patients`, which is the reason
 *    the count helpers are functions rather than templates in the first place.
 *
 * Doctor names, department names and room labels stay as the clinic typed them.
 * They are data, not interface chrome, and translating a person's name is not
 * this application's business.
 */

import type { QueueStatus } from '../../types/database'
import { dateParts, resolveTimeZone } from '../utils'
import type { Messages } from './types'

const months = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const

const weekdays = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
] as const

/**
 * The ASCII twin of `toMarathiDigits`, with the same deliberate asymmetry:
 * a pure number is zero-padded to `width`, whereas digits embedded in a longer
 * string (a clock time, a range) are passed through untouched so `'10:24'`
 * never becomes `'010:24'`.
 */
function asciiDigits(value: string | number, width = 0): string {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return ''
    const negative = value < 0
    const digits = Math.trunc(Math.abs(value)).toString().padStart(Math.max(width, 0), '0')
    return (negative ? '-' : '') + digits
  }

  const trimmed = value.trim()
  if (trimmed === '') return ''

  if (/^-?\d+$/.test(trimmed)) {
    const negative = trimmed.startsWith('-')
    return (negative ? '-' : '') + trimmed.replace('-', '').padStart(Math.max(width, 0), '0')
  }

  return trimmed
}

function englishPatientCount(count: number): string {
  return count === 1 ? '1 patient' : `${count} patients`
}

function englishMinutes(minutes: number): string {
  const rounded = Math.max(0, Math.round(minutes))
  if (rounded === 0) return 'a few moments'
  return rounded === 1 ? '1 minute' : `${rounded} minutes`
}

function formatEnglishDate(date: Date, timeZone: string): string {
  const parts = dateParts(date, timeZone)
  if (!parts) return ''
  return `${parts.day} ${months[parts.monthIndex]} ${parts.year}`
}

function formatEnglishDateWithWeekday(date: Date, timeZone: string): string {
  const parts = dateParts(date, timeZone)
  if (!parts) return ''
  return `${weekdays[parts.weekdayIndex]}, ${parts.day} ${months[parts.monthIndex]} ${parts.year}`
}

/** A clock time in the hospital's timezone, in Western digits. */
function formatEnglishTime(iso: string | Date, timeZone: string): string {
  const date = typeof iso === 'string' ? new Date(iso) : iso
  if (Number.isNaN(date.getTime())) return ''
  // Formatted against the HOSPITAL's zone, never the device's. `resolveTimeZone`
  // is the same guard every other locale uses, so a typo in Settings degrades
  // to Asia/Kolkata here too rather than throwing inside `Intl`.
  return asciiDigits(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: resolveTimeZone(timeZone),
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(date),
  )
}

function asDate(iso: string | Date): Date {
  return typeof iso === 'string' ? new Date(iso) : iso
}

/** `Room 1` */
function roomShort(roomNumber: string): string {
  return `Room ${asciiDigits(roomNumber, 0)}`
}

/** `Please go to room 1.` */
function roomInstruction(roomNumber: string): string {
  return `Please go to room ${asciiDigits(roomNumber, 0)}.`
}

const status: Record<QueueStatus, string> = {
  WAITING: 'Waiting',
  CALLED: 'Called',
  IN_CONSULTATION: 'In consultation',
  COMPLETED: 'Completed',
  SKIPPED: 'Skipped',
}

export const en: Messages = {
  name: 'English',

  token: (tokenNumber) => asciiDigits(tokenNumber, 3),
  count: (value) => asciiDigits(value, 0),
  digits: (value, width = 0) => asciiDigits(value, width),
  time: (iso, timeZone) => formatEnglishTime(iso, timeZone),
  date: (iso, timeZone) => formatEnglishDate(asDate(iso), timeZone),
  dateWithWeekday: (iso, timeZone) => formatEnglishDateWithWeekday(asDate(iso), timeZone),

  months,
  weekdays,

  patientCount: englishPatientCount,
  minutes: englishMinutes,

  status,
  patientType: {
    NEW: 'New patient',
    FOLLOWUP: 'Follow-up',
  },

  roomShort,
  roomInstruction,

  announcement: (tokenNumber, roomNumber) =>
    `Token number ${asciiDigits(tokenNumber, 3)}, please come to room ${asciiDigits(roomNumber, 0)}.`,

  patientsAhead: (count) => `Ahead of you: ${englishPatientCount(count)}`,
  waitingCount: (count) => `Waiting: ${count}`,

  describeSituation: ({ status: queueStatus, patientsAhead, roomNumber }) => {
    switch (queueStatus) {
      case 'SKIPPED':
        return {
          tone: 'attention',
          headline: 'Your number has been skipped.',
          detail: 'Please speak to reception.',
          urgent: true,
        }

      case 'COMPLETED':
        return {
          tone: 'done',
          headline: 'Your consultation is complete.',
          detail: 'Thank you for your visit. You are free to leave.',
          urgent: false,
        }

      case 'IN_CONSULTATION':
        return {
          tone: 'now',
          headline: 'Your consultation is in progress.',
          detail: `Please stay in room ${asciiDigits(roomNumber, 0)}.`,
          urgent: false,
        }

      case 'CALLED':
        return {
          tone: 'now',
          headline: 'It is your turn now.',
          detail: roomInstruction(roomNumber),
          urgent: true,
        }

      case 'WAITING':
      default:
        if (patientsAhead <= 0) {
          return {
            tone: 'soon',
            headline: 'Your turn is next.',
            detail: 'Please be ready — you are next in line.',
            urgent: true,
          }
        }
        if (patientsAhead <= 2) {
          return {
            tone: 'soon',
            headline: 'Your turn is coming up.',
            detail: `${englishPatientCount(patientsAhead)} ahead of you. Please stay nearby.`,
            urgent: false,
          }
        }
        return {
          tone: 'waiting',
          headline: 'You are registered. Please wait.',
          detail: `${englishPatientCount(patientsAhead)} ahead of you.`,
          urgent: false,
        }
    }
  },

  errors: {
    NAME_REQUIRED: "Please enter the patient's name.",
    NAME_TOO_LONG: 'That name is too long. Please shorten it.',
    INVALID_MOBILE: 'Please enter a valid 10-digit mobile number.',
    INVALID_PATIENT_TYPE: 'Please choose the patient type.',
    DOCTOR_REQUIRED: 'Please choose a doctor.',
    DOCTOR_NOT_FOUND: 'No queue is available right now. Please speak to reception.',
    DOCTOR_INACTIVE: 'This queue is currently closed. Please speak to reception.',
    DOCTOR_HAS_HISTORY:
      'This doctor has past patient records, so they cannot be deleted. Close their queue instead.',
    HOSPITAL_NOT_FOUND: 'No queue is available right now. Please speak to reception.',
    TOKEN_NOT_FOUND: 'That token number was not found. Please speak to reception.',
    NOT_AUTHORIZED: 'You are not allowed to do that. Please sign in again.',
    INVALID_STATUS_TRANSITION: 'That action is no longer possible. Please refresh the page.',
    INVALID_CREDENTIALS: 'The email or password is incorrect.',
    STAFF_NOT_LINKED: 'Your account is not linked to a hospital. Please contact an administrator.',
    QUEUE_EMPTY: 'Nobody is waiting in the queue.',
    INVALID_TIME_ZONE:
      'That time zone was not recognised. Please write it in English, in the form "Asia/Kolkata".',
    OFFLINE: 'Please check your internet connection.',
    TIMEOUT: 'The server is taking too long to respond. Please try again.',
    NETWORK: 'Something went wrong. Please try again.',
    UNKNOWN: 'Something went wrong. Please try again.',
  },

  ui: {
    common: {
      loading: 'Please wait a moment…',
      retry: 'Try again',
      cancel: 'Cancel',
      hospitalFallback: 'Your hospital',
      queueSystem: 'Patient queue management',
      notProvided: 'Not provided',
      online: 'Connected',
      connectionLost: 'Connection lost',
      offline: 'Please check your internet connection.',
      language: 'Language',
    },

    nav: {
      label: 'Main menu',
      queue: 'Queue',
      doctors: 'Doctors',
      settings: 'Settings',
      qr: 'QR code',
    },

    staff: {
      checkingLogin: 'Checking your login…',
      role: 'Reception',
      signOut: 'Sign out',
    },

    patient: {
      help: 'For help:',
    },

    home: {
      register: 'Join the queue',
      registerHint: 'Get a token and watch the queue',
      staffLogin: 'Reception login',
      staffLoginHint: 'For calling patients in',
    },

    register: {
      title: 'Join the patient queue',
      subtitle: 'Fill in the details below to get your token number.',
      loadingDoctors: 'Loading…',
      emptyTitle: 'No queue is available right now.',
      emptyDescription: 'Please speak to reception.',
    },

    token: {
      loading: 'Fetching your token number…',
      notFoundTitle: 'That token number was not found.',
      notFoundDescription: 'Please speak to reception, or register again.',
      registerAction: 'Join the queue',
      errorFallback: 'We could not load your details.',
      confirmed: 'Registration confirmed',
      myToken: 'Your token number',
      currentlyServing: 'Now serving',
      aheadOfYou: 'Ahead of you',
      keepPhoneTitle: 'Please keep your phone nearby.',
      keepPhoneDetail: 'This page updates on its own — there is no need to refresh.',
      refreshNow: 'Refresh now',
    },

    dashboard: {
      loadingDoctors: 'Loading doctors…',
      noDoctorsTitle: 'No doctors have been added yet.',
      noDoctorsDescription: 'Add a doctor before starting the queue.',
      addDoctor: 'Add a doctor',
      selectDoctor: 'Choose a doctor',
      waiting: 'Waiting',
      totalToday: 'Total today',
      remaining: 'Remaining',
      currentlyServing: 'Now serving',
      callNext: 'Call the next patient',
      nextToken: 'Next number:',
      nobodyWaiting: 'Nobody is waiting',
      queueEmptyNotice: 'Nobody is waiting in the queue.',
      openDisplay: 'Open the TV display',
      queueTitle: "Today's queue",
      queueCount: (count) => `${count} ${count === 1 ? 'entry' : 'entries'} in total`,
      queueLoading: 'Loading the queue…',
      emptyQueueTitle: 'No patients have registered today yet.',
      emptyQueueDescription: 'Patients appear here as soon as they scan the QR code and register.',
    },

    doctors: {
      title: 'Doctors',
      description: 'Manage the doctors who appear in the queue.',
      addNew: 'New doctor',
      addSubmit: 'Add doctor',
      loading: 'Loading doctors…',
      emptyTitle: 'No doctors have been added yet.',
      emptyDescription: 'Add at least one doctor to start a queue.',
      inactiveBadge: 'Closed',
      active: 'Queue open',
      inactive: 'Queue closed',
      qr: 'QR',
      display: 'Display',
      edit: 'Edit',
      delete: 'Delete',
      deleteConfirm: (doctorName) => `Delete ${doctorName}?`,
      deleteWarning:
        'This cannot be undone. A doctor with past patient records cannot be deleted — close their queue instead.',
    },

    login: {
      checking: 'Checking your login…',
      subtitle: 'Reception login',
      email: 'Email',
      password: 'Password',
      submitting: 'Signing in…',
      submit: 'Sign in',
      backHome: 'Back to the home page',
      demoMode: 'Demo mode:',
    },

    notFound: {
      title: 'This page was not found.',
      description: 'Please check the link reception gave you, or go to the home page.',
      home: 'Home',
    },

    qr: {
      title: 'QR code',
      description: 'Print this QR code and put it up at reception. Patients scan it to register.',
      download: 'Download PNG',
      print: 'Print',
      forWhom: 'For whom?',
      allDoctors: 'All doctors (general QR)',
      doctorHint: "Scanning a doctor's own QR code selects that doctor automatically.",
      addressInQr: 'Address in the QR code:',
      generateFailed: 'The QR code could not be generated. Please refresh the page.',
      qrAlt: (url) => `QR code for the registration address: ${url}`,
      posterHeading: 'Scan the QR code to join the queue',
      scanInstruction: 'Scan the QR code',
      getTokenOnMobile: 'Get your token number on your phone',
      steps: [
        '1. Open your phone camera.',
        '2. Point it at this QR code.',
        '3. Open the link that appears.',
        '4. Enter your name, choose a doctor, and get your token.',
      ],
      noMobile: 'No mobile phone? Register at reception.',
      displayLinksTitle: 'TV display links',
      displayLinksDescription:
        'Open these on a TV, monitor or tablet. No patient names appear there.',
      noDoctorsTitle: 'No doctors have been added yet.',
      noDoctorsDescription: 'Add a doctor first to get the display links.',
    },

    display: {
      loading: 'Loading…',
      unavailable: 'This display is unavailable.',
      checkUrl: 'Please speak to reception, or check the URL.',
      emptyQueue: "Today's queue has not started yet.",
      currentLabel: 'Token being served',
      nextLabel: 'Next number',
      waitingLabel: 'Waiting',
    },

    settings: {
      title: 'Hospital settings',
      description: 'This information appears to patients and on the TV display.',
      loading: 'Loading settings…',
      loadFailed: 'Could not load the hospital details. Please try again.',
      name: 'Hospital name',
      namePlaceholder: 'Your hospital name',
      address: 'Address',
      phone: 'Phone',
      timezone: 'Time zone',
      timezoneHint: 'The queue restarts at midnight in this time zone.',
      avgMinutes: 'Average consultation time (minutes)',
      avgHint: 'Used only to estimate the waiting time shown to patients.',
      displayMessage: 'Message on the TV',
      displayMessagePlaceholder: 'Please wait for your number to be called.',
      announceAloud: 'Announce numbers aloud',
      saved: 'Settings saved.',
      save: 'Save',
    },

    queueTable: {
      caption: "Today's patient queue",
      token: 'Token',
      patientName: 'Patient name',
      registeredAt: 'Registered',
      status: 'Status',
      actions: 'Actions',
      call: 'Call',
      recall: 'Call again',
      start: 'Start consultation',
      complete: 'Complete',
      skip: 'Skip',
      details: 'Details',
      mobile: 'Mobile number',
      patientType: 'Patient type',
      calledAt: 'Called at',
    },

    registrationForm: {
      nameLabel: "Patient's name",
      namePlaceholder: 'e.g. Ramesh Patil',
      mobileLabel: 'Mobile number',
      optional: '(optional)',
      mobilePlaceholder: 'e.g. 98765 43210',
      mobileHint: 'If you give one, reception can contact you. It is fine to leave it blank.',
      doctorLegend: 'Choose a doctor',
      patientTypeLegend: 'Patient type',
      privacyNote:
        'This entry is only for managing the queue. Please do not enter medical information here.',
      submitting: 'Registering…',
      submit: 'Get my token',
    },

    doctorForm: {
      nameLabel: "Doctor's name",
      namePlaceholder: 'e.g. Dr Amol Deshmukh',
      departmentLabel: 'Department',
      departmentPlaceholder: 'e.g. General medicine',
      roomLabel: 'Room number',
      roomPlaceholder: 'e.g. 1',
      activeLabel: 'Queue open (shown on the registration form)',
      nameRequired: "Please enter the doctor's name.",
      save: 'Save',
    },

    announcement: {
      turnOff: 'Turn sound off',
      turnOn: 'Turn sound on',
      turnedOnSpoken: 'Sound is on.',
      unsupported: 'This browser has no voice for the selected language. The queue still works.',
      fallbackVoice:
        'No voice was found for this language — a different one will be used, so pronunciation may differ.',
    },

    demo: {
      label: 'Demo mode — data is kept only in this browser',
      seed: (count) => `Add ${count} patients`,
      reset: 'Clear demo data',
    },

    errorBoundary: {
      title: 'Something went wrong.',
      description:
        'Please reload the page. If the problem continues, please speak to reception.',
      reload: 'Reload the page',
    },

    tokenDetails: {
      doctor: 'Doctor',
      department: 'Department',
      room: 'Consultation room',
      date: 'Date',
      hospital: 'Hospital',
      waitPrefix: 'Estimated wait:',
      waitDisclaimer: 'This is only an estimate — the actual wait may be a little longer or shorter.',
    },
  },
}
