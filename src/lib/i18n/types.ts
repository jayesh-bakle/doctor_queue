/**
 * The contract every locale must satisfy.
 *
 * This is an interface rather than a flat key → string table for one reason:
 * Marathi and Hindi inflect differently from English, so a string of the shape
 * `"{{count}} patients are ahead of you"` cannot produce the Marathi sentence.
 * Marathi marks plurality on the noun itself —
 *
 *   मराठी    १ रुग्ण आपल्यापुढे आहे.     ३ रुग्णे आपल्यापुढे आहेत.
 *   English  1 patient is ahead of you.  3 patients are ahead of you.
 *
 * — so the grammar-bearing entries are functions. A template can be missing a
 * branch; a function cannot.
 *
 * `Messages` is deliberately exhaustive. All three locales are held in a
 * `Record<Language, Messages>`, which means the compiler refuses to build the
 * moment one locale is missing a string or a component. A half-translated screen
 * is a type error, not something a patient discovers.
 */

import type { AppErrorCode } from '../errors'
import type { PatientType, QueueStatus } from '../../types/database'
import type { PatientSituation } from '../../types/queue'

export type Language = 'mr' | 'hi' | 'en'

export interface DescribeSituationParams {
  status: QueueStatus
  tokenNumber: number
  patientsAhead: number
  currentToken: number | null
  roomNumber: string
}

/**
 * Fixed UI text, grouped by the screen or component that owns it.
 *
 * Kept as plain strings with no interpolation, because anything that needs a
 * number in it has been promoted to a function on {@link Messages} so each
 * language can place the number where its own grammar wants it.
 */
export interface UiMessages {
  common: {
    /** Default caption for a spinner. */
    loading: string
    retry: string
    cancel: string
    hospitalFallback: string
    queueSystem: string
    /** Shown for a value the patient never supplied. */
    notProvided: string
    online: string
    connectionLost: string
    offline: string
    /** `aria-label` for the language switcher group. */
    language: string
  }

  nav: {
    /** `aria-label` for the staff navigation landmark. */
    label: string
    queue: string
    doctors: string
    settings: string
    qr: string
  }

  staff: {
    checkingLogin: string
    role: string
    signOut: string
  }

  patient: {
    /** Prefix on the hospital phone number in the patient footer. */
    help: string
  }

  home: {
    staffLogin: string
    staffLoginHint: string
    /** Tells a patient who reached the bare site address what to do instead. */
    patientHint: string
  }

  register: {
    title: string
    subtitle: string
    loadingDoctors: string
    emptyTitle: string
    emptyDescription: string
    /** Shown when the URL does not name a hospital that exists. */
    hospitalMissingTitle: string
    hospitalMissingDescription: string
    /** Heading above the per-doctor live token summary. */
    queueSummaryTitle: string
    nowServing: string
    waitingLabel: string
  }

  token: {
    loading: string
    notFoundTitle: string
    notFoundDescription: string
    registerAction: string
    errorFallback: string
    confirmed: string
    /** Label above the huge token number. */
    myToken: string
    currentlyServing: string
    aheadOfYou: string
    keepPhoneTitle: string
    keepPhoneDetail: string
    refreshNow: string
  }

  dashboard: {
    loadingDoctors: string
    noDoctorsTitle: string
    noDoctorsDescription: string
    addDoctor: string
    selectDoctor: string
    waiting: string
    totalToday: string
    remaining: string
    currentlyServing: string
    callNext: string
    /** Prefix before the next token number. */
    nextToken: string
    nobodyWaiting: string
    queueEmptyNotice: string
    openDisplay: string
    queueTitle: string
    /** `एकूण १२ नोंदी` — a count, so it inflects. */
    queueCount: (count: number) => string
    queueLoading: string
    emptyQueueTitle: string
    emptyQueueDescription: string
  }

  doctors: {
    title: string
    description: string
    addNew: string
    addSubmit: string
    loading: string
    emptyTitle: string
    emptyDescription: string
    inactiveBadge: string
    active: string
    inactive: string
    qr: string
    display: string
    edit: string
    /** Removes a doctor added by mistake. Never applies to one with history. */
    delete: string
    /** Names the doctor, so the confirmation cannot be misread. */
    deleteConfirm: (doctorName: string) => string
    deleteWarning: string
  }

  login: {
    checking: string
    subtitle: string
    email: string
    password: string
    submitting: string
    submit: string
    backHome: string
    demoMode: string
    /** Shown when a `/staff/login/:hospitalId` link names no known hospital. */
    hospitalMissingTitle: string
    hospitalMissingDescription: string
    /** The account signed in, but belongs to a different clinic than the URL. */
    wrongHospital: string
  }

  notFound: {
    title: string
    description: string
    home: string
  }

  qr: {
    title: string
    description: string
    download: string
    print: string
    forWhom: string
    allDoctors: string
    doctorHint: string
    addressInQr: string
    generateFailed: string
    qrAlt: (url: string) => string
    posterHeading: string
    scanInstruction: string
    getTokenOnMobile: string
    /** The four numbered steps. Each locale numbers them its own way. */
    steps: readonly string[]
    noMobile: string
    displayLinksTitle: string
    displayLinksDescription: string
    noDoctorsTitle: string
    noDoctorsDescription: string
    /** The clinic-specific staff sign-in address, per-hospital. */
    staffLinkTitle: string
    staffLinkDescription: string
    copyLink: string
    copied: string
  }

  display: {
    loading: string
    unavailable: string
    checkUrl: string
    emptyQueue: string
    currentLabel: string
    nextLabel: string
    waitingLabel: string
  }

  settings: {
    title: string
    description: string
    loading: string
    loadFailed: string
    name: string
    namePlaceholder: string
    address: string
    phone: string
    timezone: string
    timezoneHint: string
    avgMinutes: string
    avgHint: string
    displayMessage: string
    displayMessagePlaceholder: string
    announceAloud: string
    saved: string
    save: string
  }

  queueTable: {
    caption: string
    token: string
    patientName: string
    registeredAt: string
    status: string
    actions: string
    call: string
    recall: string
    start: string
    complete: string
    skip: string
    details: string
    mobile: string
    patientType: string
    calledAt: string
  }

  registrationForm: {
    nameLabel: string
    namePlaceholder: string
    mobileLabel: string
    optional: string
    mobilePlaceholder: string
    mobileHint: string
    doctorLegend: string
    patientTypeLegend: string
    privacyNote: string
    submitting: string
    submit: string
  }

  doctorForm: {
    nameLabel: string
    namePlaceholder: string
    departmentLabel: string
    departmentPlaceholder: string
    roomLabel: string
    roomPlaceholder: string
    activeLabel: string
    nameRequired: string
    save: string
  }

  announcement: {
    /** Label states what the button will do, not the current state. */
    turnOff: string
    turnOn: string
    /** Spoken back when the toggle is switched on, to prove audio works. */
    turnedOnSpoken: string
    unsupported: string
    fallbackVoice: string
  }

  demo: {
    label: string
    seed: (count: number) => string
    reset: string
  }

  errorBoundary: {
    title: string
    description: string
    reload: string
  }

  tokenDetails: {
    doctor: string
    department: string
    room: string
    date: string
    hospital: string
    /** Prefix before the estimate, e.g. `अंदाजे प्रतीक्षा वेळ: ३० मिनिटे`. */
    waitPrefix: string
    waitDisclaimer: string
  }
}

export interface Messages {
  /** The language's own name for itself — an autonym, never translated. */
  name: string

  // --- Numerals ------------------------------------------------------------
  // Numerals follow the language, not the data: English shows `027`, Marathi
  // and Hindi show `०२७`.

  /** A token number, zero-padded to three digits: `०२७` / `०२७` / `027`. */
  token: (tokenNumber: number) => string
  /** A quantity, unpadded: `२७` / `२७` / `27`. */
  count: (value: number) => string
  /** Rewrites digits inside a string, padding only pure numbers. */
  digits: (value: string | number, width?: number) => string
  /** A clock time in the hospital's timezone: `१०:२४` / `१०:२४` / `10:24`. */
  time: (iso: string | Date, timeZone: string) => string
  /** `७ ऑक्टोबर २०२६` / `७ अक्टूबर २०२६` / `7 October 2026`. */
  date: (iso: string | Date, timeZone: string) => string
  /** `बुधवार, ७ ऑक्टोबर २०२६` — used in the dashboard and TV headers. */
  dateWithWeekday: (iso: string | Date, timeZone: string) => string

  months: readonly string[]
  /** Seven entries, Sunday first. */
  weekdays: readonly string[]

  // --- Quantities that inflect --------------------------------------------
  /** `१ रुग्ण` / `३ रुग्णे` — the noun changes with the count. */
  patientCount: (count: number) => string
  /** `३० मिनिटे`, or `काही क्षण` when there is nothing to wait for. */
  minutes: (minutes: number) => string

  // --- Queue wording -------------------------------------------------------
  status: Record<QueueStatus, string>
  patientType: Record<PatientType, string>
  /** `कक्ष क्र. १` — short form for headers and cards. */
  roomShort: (roomNumber: string) => string
  /** `कृपया तपासणी कक्ष क्रमांक १ मध्ये जा.` */
  roomInstruction: (roomNumber: string) => string
  /** `टोकन क्रमांक ०२७, कृपया तपासणी कक्ष क्रमांक १ मध्ये या.` */
  announcement: (tokenNumber: number, roomNumber: string) => string
  /** `आपल्यापुढे: ३ रुग्णे` */
  patientsAhead: (count: number) => string
  /** `प्रतीक्षेत: १२` */
  waitingCount: (count: number) => string

  /**
   * The single sentence the patient reads. Six branches, all of which move
   * wholesale into each locale — the wording is the thing being translated, so
   * it cannot live behind a switch statement shared by every language.
   */
  describeSituation: (params: DescribeSituationParams) => PatientSituation

  // --- Errors --------------------------------------------------------------
  /** One sentence per machine code the database can raise. */
  errors: Record<AppErrorCode, string>

  ui: UiMessages
}
