/**
 * Gujarati.
 *
 * Written in Gujarati script, with Gujarati numerals (`૦૨૭`) to match how the
 * Marathi locale uses Devanagari. The date and numeral machinery is not
 * re-implemented: it delegates to `gujaratiDigits.ts` and the language-neutral
 * `dateParts` in `utils.ts`. Only the *wording* is this module's business.
 *
 * Doctor names, department names and room labels stay as the clinic typed them.
 * They are data, not interface chrome.
 */

import type { QueueStatus } from '../../types/database'
import {
  minutesLabel,
  patientCountLabel,
  toGujaratiDigits,
  toGujaratiNumber,
  TOKEN_WIDTH,
} from '../gujaratiDigits'
import { dateParts, resolveTimeZone } from '../utils'
import type { Messages } from './types'

const months = [
  'જાન્યુઆરી',
  'ફેબ્રુઆરી',
  'માર્ચ',
  'એપ્રિલ',
  'મે',
  'જૂન',
  'જુલાઈ',
  'ઓગસ્ટ',
  'સપ્ટેમ્બર',
  'ઓક્ટોબર',
  'નવેમ્બર',
  'ડિસેમ્બર',
] as const

const weekdays = ['રવિવાર', 'સોમવાર', 'મંગળવાર', 'બુધવાર', 'ગુરુવાર', 'શુક્રવાર', 'શનિવાર'] as const

function asDate(iso: string | Date): Date {
  return typeof iso === 'string' ? new Date(iso) : iso
}

/** `૧૦:૨૪` — a clock time in the hospital's timezone, in Gujarati digits. */
function formatGujaratiTime(iso: string | Date, timeZone: string): string {
  const date = asDate(iso)
  if (Number.isNaN(date.getTime())) return ''
  const formatted = new Intl.DateTimeFormat('en-GB', {
    timeZone: resolveTimeZone(timeZone),
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date)
  return toGujaratiDigits(formatted, 0)
}

/** `૭ ઓક્ટોબર ૨૦૨૬` */
function formatGujaratiDate(date: Date, timeZone: string): string {
  const parts = dateParts(date, timeZone)
  if (!parts) return ''
  return `${toGujaratiDigits(parts.day, 0)} ${months[parts.monthIndex]} ${toGujaratiDigits(
    parts.year,
    0,
  )}`
}

/** `બુધવાર, ૭ ઓક્ટોબર ૨૦૨૬` */
function formatGujaratiDateWithWeekday(date: Date, timeZone: string): string {
  const parts = dateParts(date, timeZone)
  if (!parts) return ''
  return `${weekdays[parts.weekdayIndex]}, ${toGujaratiDigits(parts.day, 0)} ${
    months[parts.monthIndex]
  } ${toGujaratiDigits(parts.year, 0)}`
}

/** `રૂમ ૧` — short form for headers and cards. */
function roomShort(roomNumber: string): string {
  return `રૂમ ${toGujaratiDigits(roomNumber, 0)}`
}

/** `કૃપા કરીને રૂમ નંબર ૧ પર જાઓ.` */
function roomInstruction(roomNumber: string): string {
  return `કૃપા કરીને રૂમ નંબર ${toGujaratiDigits(roomNumber, 0)} પર જાઓ.`
}

const status: Record<QueueStatus, string> = {
  WAITING: 'પ્રતીક્ષામાં',
  CALLED: 'બોલાવ્યા',
  IN_CONSULTATION: 'તપાસ ચાલુ',
  COMPLETED: 'પૂર્ણ',
  SKIPPED: 'છોડી દીધા',
}

export const gu: Messages = {
  name: 'ગુજરાતી',

  token: (tokenNumber) => toGujaratiDigits(tokenNumber, TOKEN_WIDTH),
  count: (value) => toGujaratiNumber(value),
  digits: (value, width = 0) => toGujaratiDigits(value, width),
  time: (iso, timeZone) => formatGujaratiTime(iso, timeZone),
  date: (iso, timeZone) => formatGujaratiDate(asDate(iso), timeZone),
  dateWithWeekday: (iso, timeZone) => formatGujaratiDateWithWeekday(asDate(iso), timeZone),

  months,
  weekdays,

  patientCount: (count) => patientCountLabel(count),
  minutes: (minutes) => minutesLabel(minutes),

  status,
  patientType: {
    NEW: 'નવા દર્દી',
    FOLLOWUP: 'પુનઃતપાસ',
  },

  roomShort,
  roomInstruction,

  announcement: (tokenNumber, roomNumber) =>
    `ટોકન નંબર ${toGujaratiDigits(tokenNumber)}, કૃપા કરીને રૂમ નંબર ${toGujaratiDigits(
      roomNumber,
      0,
    )} પર આવો.`,

  patientsAhead: (count) => `તમારી આગળ: ${patientCountLabel(count)}`,
  waitingCount: (count) => `પ્રતીક્ષામાં: ${toGujaratiNumber(count)}`,

  describeSituation: ({ status: queueStatus, patientsAhead, roomNumber }) => {
    switch (queueStatus) {
      case 'SKIPPED':
        return {
          tone: 'attention',
          headline: 'તમારો નંબર છોડી દેવામાં આવ્યો છે.',
          detail: 'કૃપા કરીને રિસેપ્શનનો સંપર્ક કરો.',
          urgent: true,
        }

      case 'COMPLETED':
        return {
          tone: 'done',
          headline: 'તમારી તપાસ પૂર્ણ થઈ ગઈ છે.',
          detail: 'તમારી મુલાકાત માટે આભાર. તમે જવા માટે મુક્ત છો.',
          urgent: false,
        }

      case 'IN_CONSULTATION':
        return {
          tone: 'now',
          headline: 'તમારી તપાસ ચાલુ છે.',
          detail: `કૃપા કરીને રૂમ નંબર ${toGujaratiDigits(roomNumber, 0)} માં રહો.`,
          urgent: false,
        }

      case 'CALLED':
        return {
          tone: 'now',
          headline: 'હવે તમારો નંબર છે.',
          detail: roomInstruction(roomNumber),
          urgent: true,
        }

      case 'WAITING':
      default:
        if (patientsAhead <= 0) {
          return {
            tone: 'soon',
            headline: 'તમારો નંબર નજીક છે.',
            detail: 'કૃપા કરીને તૈયાર રહો — આગળનો નંબર તમારો છે.',
            urgent: true,
          }
        }
        if (patientsAhead <= 2) {
          return {
            tone: 'soon',
            headline: 'તમારો નંબર નજીક આવી રહ્યો છે.',
            detail: `${patientCountLabel(patientsAhead)} તમારી આગળ છે. કૃપા કરીને નજીક રહો.`,
            urgent: false,
          }
        }
        return {
          tone: 'waiting',
          headline: 'તમારી નોંધણી થઈ ગઈ છે. કૃપા કરીને રાહ જુઓ.',
          detail: `${patientCountLabel(patientsAhead)} તમારી આગળ છે.`,
          urgent: false,
        }
    }
  },

  errors: {
    NAME_REQUIRED: 'કૃપા કરીને દર્દીનું નામ ભરો.',
    NAME_TOO_LONG: 'નામ ઘણું લાંબુ છે. કૃપા કરીને ટૂંકું કરો.',
    INVALID_MOBILE: 'કૃપા કરીને સાચો ૧૦ અંકનો મોબાઈલ નંબર ભરો.',
    INVALID_PATIENT_TYPE: 'કૃપા કરીને દર્દીનો પ્રકાર પસંદ કરો.',
    DOCTOR_REQUIRED: 'કૃપા કરીને ડૉક્ટર પસંદ કરો.',
    DOCTOR_NOT_FOUND: 'હાલ કોઈ કતાર ઉપલબ્ધ નથી. કૃપા કરીને રિસેપ્શનનો સંપર્ક કરો.',
    DOCTOR_INACTIVE: 'આ કતાર હાલ બંધ છે. કૃપા કરીને રિસેપ્શનનો સંપર્ક કરો.',
    DOCTOR_HAS_HISTORY:
      'આ ડૉક્ટર પાસે જૂના દર્દી રેકોર્ડ છે, તેથી તેમને કાઢી શકાતા નથી. નવી નોંધણી બંધ કરવા "એડિટ કરો" ખોલો અને "કતાર ચાલુ" નું નિશાન કાઢી નાખો — જૂના રેકોર્ડ સુરક્ષિત રહેશે.',
    HOSPITAL_NOT_FOUND: 'હાલ કોઈ કતાર ઉપલબ્ધ નથી. કૃપા કરીને રિસેપ્શનનો સંપર્ક કરો.',
    TOKEN_NOT_FOUND: 'આ ટોકન નંબર મળ્યો નથી. કૃપા કરીને રિસેપ્શનનો સંપર્ક કરો.',
    NOT_AUTHORIZED: 'તમને આ ક્રિયા કરવાની પરવાનગી નથી. કૃપા કરીને ફરી લોગિન કરો.',
    INVALID_STATUS_TRANSITION: 'આ ક્રિયા હવે શક્ય નથી. કૃપા કરીને પાનું રિફ્રેશ કરો.',
    INVALID_CREDENTIALS: 'ઈમેલ અથવા પાસવર્ડ ખોટો છે.',
    STAFF_NOT_LINKED: 'તમારું ખાતું હોસ્પિટલ સાથે જોડાયેલું નથી. કૃપા કરીને એડમિનિસ્ટ્રેટરનો સંપર્ક કરો.',
    QUEUE_EMPTY: 'કતારમાં હવે કોઈ રાહ જોતું નથી.',
    QUEUE_FULL: 'આજની આ કતાર ભરાઈ ગઈ છે. કૃપા કરીને રિસેપ્શનનો સંપર્ક કરો.',
    TURNSTILE_FAILED:
      'સુરક્ષા ચકાસણી પૂર્ણ થઈ નથી. કૃપા કરીને પૃષ્ઠ ફરી લોડ કરીને પ્રયત્ન કરો.',
    INVALID_TIME_ZONE:
      'આ ટાઈમ ઝોન ઓળખાયો નથી. કૃપા કરીને અંગ્રેજીમાં "Asia/Kolkata" સ્વરૂપમાં લખો.',
    OFFLINE: 'કૃપા કરીને તમારું ઇન્ટરનેટ કનેક્શન તપાસો.',
    TIMEOUT: 'સર્વરને જવાબ આપવામાં વધુ સમય લાગે છે. કૃપા કરીને ફરી પ્રયાસ કરો.',
    NETWORK: 'કંઈક તકનીકી સમસ્યા આવી છે. કૃપા કરીને ફરી પ્રયાસ કરો.',
    UNKNOWN: 'કંઈક તકનીકી સમસ્યા આવી છે. કૃપા કરીને ફરી પ્રયાસ કરો.',
  },

  ui: {
    common: {
      loading: 'કૃપા કરીને થોડી રાહ જુઓ…',
      retry: 'ફરી પ્રયાસ કરો',
      cancel: 'રદ કરો',
      hospitalFallback: 'તમારી હોસ્પિટલ',
      queueSystem: 'દર્દી કતાર વ્યવસ્થાપન',
      notProvided: 'આપેલ નથી',
      online: 'જોડાયેલું છે',
      connectionLost: 'કનેક્શન તૂટી ગયું',
      offline: 'કૃપા કરીને તમારું ઇન્ટરનેટ કનેક્શન તપાસો.',
      language: 'ભાષા',
    },

    nav: {
      label: 'મુખ્ય મેનૂ',
      queue: 'રાંગ',
      analytics: 'આંકડાઓ',
      admin: 'બધી હોસ્પિટલો',
      doctors: 'ડૉક્ટરો',
      settings: 'સેટિંગ્સ',
      qr: 'QR કોડ',
    },

    staff: {
      checkingLogin: 'લોગિન તપાસી રહ્યું છે…',
      role: 'રિસેપ્શન',
      signOut: 'લોગ આઉટ',
    },

    patient: {
      help: 'મદદ માટે:',
    },

    home: {
      staffLogin: 'રિસેપ્શન લોગિન',
      staffLoginHint: 'દર્દીઓને બોલાવવા માટે',
      patientHint: 'દર્દીઓ માટે: રિસેપ્શન પરનો QR કોડ સ્કેન કરો.',
    },

    register: {
      title: 'દર્દી કતારમાં નોંધણી',
      subtitle: 'નીચેની માહિતી ભરો અને તમારો ટોકન નંબર મેળવો.',
      loadingDoctors: 'માહિતી લોડ થઈ રહી છે…',
      emptyTitle: 'હાલ કોઈ કતાર ઉપલબ્ધ નથી.',
      emptyDescription: 'કૃપા કરીને રિસેપ્શનનો સંપર્ક કરો.',
      hospitalMissingTitle: 'આ હોસ્પિટલ મળી નથી.',
      hospitalMissingDescription:
        'કૃપા કરીને રિસેપ્શન પરનો QR કોડ ફરી સ્કેન કરો અથવા રિસેપ્શનનો સંપર્ક કરો.',
      queueSummaryTitle: 'અત્યારની કતાર',
      nowServing: 'હાલ ચાલુ',
      waitingLabel: 'પ્રતીક્ષામાં',
    },

    token: {
      loading: 'તમારો ટોકન નંબર મેળવી રહ્યું છે…',
      notFoundTitle: 'આ ટોકન નંબર મળ્યો નથી.',
      notFoundDescription: 'કૃપા કરીને રિસેપ્શનનો સંપર્ક કરો અથવા ફરી નોંધણી કરો.',
      registerAction: 'કતારમાં નોંધણી કરો',
      errorFallback: 'માહિતી મળી નથી.',
      confirmed: 'નોંધણી સફળ',
      myToken: 'તમારો ટોકન નંબર',
      currentlyServing: 'હાલ ચાલુ',
      aheadOfYou: 'તમારી આગળ',
      keepPhoneTitle: 'કૃપા કરીને તમારો ફોન નજીક રાખો.',
      keepPhoneDetail: 'આ માહિતી જાતે બદલાતી રહેશે — પાનું રિફ્રેશ કરવાની જરૂર નથી.',
      refreshNow: 'હવે રિફ્રેશ કરો',
    },

    dashboard: {
      loadingDoctors: 'ડૉક્ટરોની માહિતી લોડ થઈ રહી છે…',
      noDoctorsTitle: 'હજી કોઈ ડૉક્ટર ઉમેરાયા નથી.',
      noDoctorsDescription: 'કતાર શરૂ કરતાં પહેલાં ડૉક્ટર ઉમેરો.',
      addDoctor: 'ડૉક્ટર ઉમેરો',
      selectDoctor: 'ડૉક્ટર પસંદ કરો',
      waiting: 'પ્રતીક્ષામાં',
      totalToday: 'કુલ આજે',
      remaining: 'બાકી',
      currentlyServing: 'હાલ ચાલુ',
      callNext: 'આગળના દર્દીને બોલાવો',
      nextToken: 'આગળનો નંબર:',
      nobodyWaiting: 'પ્રતીક્ષામાં કોઈ નથી',
      queueEmptyNotice: 'કતારમાં હવે કોઈ રાહ જોતું નથી.',
      openDisplay: 'ટીવી ડિસ્પ્લે ખોલો',
      queueTitle: 'આજની કતાર',
      queueCount: (count) => `કુલ ${toGujaratiNumber(count)} નોંધ`,
      queueLoading: 'કતાર લોડ થઈ રહી છે…',
      emptyQueueTitle: 'આજે હજી કોઈ દર્દીએ નોંધણી કરી નથી.',
      emptyQueueDescription: 'દર્દીઓ QR કોડ સ્કેન કરીને નોંધણી કરશે, ત્યારે તે અહીં દેખાશે.',
      todayAtAGlance: 'આજે એક નજરમાં',
      todayHint: 'આજના કુલ આંકડા, બધા ડૉક્ટરો.',
      todayLoading: 'આજના આંકડા લોડ થઈ રહ્યા છે…',
      todayRegistered: 'નોંધણી',
      todayCompleted: 'પૂર્ણ',
      todayWaiting: 'રાહ જોઈ રહ્યા છે',
      todaySkipped: 'છોડી દીધા',
      todayAvgWait: 'સરેરાશ રાહ',
      todayPeakHour: 'સૌથી વધુ ભીડનો સમય',
    },

    doctors: {
      title: 'ડૉક્ટર વ્યવસ્થાપન',
      description: 'કતારમાં દેખાતા ડૉક્ટરોનું અહીં સંચાલન કરો.',
      addNew: 'નવા ડૉક્ટર',
      addSubmit: 'ડૉક્ટર ઉમેરો',
      loading: 'ડૉક્ટરોની માહિતી લોડ થઈ રહી છે…',
      emptyTitle: 'હજી કોઈ ડૉક્ટર ઉમેરાયા નથી.',
      emptyDescription: 'કતાર શરૂ કરવા માટે ઓછામાં ઓછા એક ડૉક્ટર ઉમેરો.',
      inactiveBadge: 'બંધ',
      active: 'કતાર ચાલુ',
      inactive: 'કતાર બંધ',
      qr: 'QR',
      display: 'ડિસ્પ્લે',
      edit: 'બદલો',
      delete: 'કાઢો',
      deleteConfirm: (doctorName) => `${doctorName} ને કાઢવા છે?`,
      deleteWarning:
        'આ ડૉક્ટર કાયમ માટે કાઢી નાખવામાં આવશે. જો આ ડૉક્ટર પાસે જૂના દર્દી રેકોર્ડ હોય, તો કાઢવું અટકાવવામાં આવશે — ત્યારે "એડિટ કરો"માં "કતાર ચાલુ" નું નિશાન કાઢી નાખો.',
    },

    login: {
      checking: 'લોગિન તપાસી રહ્યું છે…',
      subtitle: 'રિસેપ્શન લોગિન',
      email: 'ઈમેલ',
      password: 'પાસવર્ડ',
      submitting: 'લોગિન થઈ રહ્યું છે…',
      submit: 'લોગિન કરો',
      backHome: 'મુખ્ય પાના પર પાછા જાઓ',
      demoMode: 'ડેમો મોડ:',
      hospitalMissingTitle: 'આ હોસ્પિટલ મળી નથી.',
      hospitalMissingDescription:
        'લોગિન લિંક ખોટી છે. કૃપા કરીને આ હોસ્પિટલની સાચી લિંક વાપરો અથવા એડમિનિસ્ટ્રેટરનો સંપર્ક કરો.',
      wrongHospital:
        'આ ખાતું આ હોસ્પિટલ સાથે જોડાયેલું નથી. કૃપા કરીને આ હોસ્પિટલના કર્મચારીના ખાતાથી લોગિન કરો.',
    },

    notFound: {
      title: 'આ પાનું મળ્યું નથી.',
      description: 'કૃપા કરીને રિસેપ્શને આપેલી લિંક તપાસો અથવા મુખ્ય પાના પર જાઓ.',
      home: 'મુખ્ય પાનું',
    },

    qr: {
      title: 'QR કોડ',
      description: 'આ QR કોડ છાપીને રિસેપ્શન પર લગાવો. દર્દીઓ સ્કેન કરીને નોંધણી કરશે.',
      download: 'PNG ડાઉનલોડ',
      print: 'છાપો',
      forWhom: 'કોના માટે?',
      allDoctors: 'બધા ડૉક્ટર (સામાન્ય QR)',
      doctorHint: 'ચોક્કસ ડૉક્ટરનો QR સ્કેન કરવાથી તે ડૉક્ટરની પસંદગી આપોઆપ થાય છે.',
      addressInQr: 'QR માંનું સરનામું:',
      generateFailed: 'QR કોડ બનાવી શકાયો નથી. કૃપા કરીને પાનું રિફ્રેશ કરો.',
      qrAlt: (url) => `નોંધણી સરનામા માટે QR કોડ: ${url}`,
      posterHeading: 'કતારમાં નોંધણી કરવા QR કોડ સ્કેન કરો',
      scanInstruction: 'QR કોડ સ્કેન કરો',
      getTokenOnMobile: 'તમારો ટોકન નંબર મોબાઈલ પર મેળવો',
      steps: [
        '૧. મોબાઈલનો કેમેરા ખોલો.',
        '૨. આ QR કોડ કેમેરા સામે ધરો.',
        '૩. દેખાતી લિંક ખોલો.',
        '૪. નામ અને ડૉક્ટર પસંદ કરીને ટોકન મેળવો.',
      ],
      noMobile: 'મોબાઈલ ન હોય તો રિસેપ્શન પર નોંધણી કરો.',
      displayLinksTitle: 'ટીવી ડિસ્પ્લે લિંક',
      displayLinksDescription:
        'આ લિંક ટીવી, મોનિટર કે ટેબ્લેટ પર ખોલો. તેમાં બધા સક્રિય ડૉક્ટર દેખાય છે; દર્દીઓનાં નામ દેખાતાં નથી.',
      noDoctorsTitle: 'હજી ડૉક્ટર ઉમેરાયા નથી.',
      noDoctorsDescription: 'ડિસ્પ્લે લિંક મેળવવા માટે પહેલાં ડૉક્ટર ઉમેરો.',
      staffLinkTitle: 'રિસેપ્શન લોગિન લિંક',
      staffLinkDescription:
        'આ લિંક આ હોસ્પિટલના રિસેપ્શન માટે સાચવો. આ લિંકથી લોગિન કરવાથી આ હોસ્પિટલનું નામ દેખાય છે.',
      copyLink: 'કૉપિ કરો',
      copied: 'કૉપિ થયું',
    },

    display: {
      loading: 'માહિતી લોડ થઈ રહી છે…',
      unavailable: 'આ ડિસ્પ્લે ઉપલબ્ધ નથી.',
      checkUrl: 'કૃપા કરીને રિસેપ્શનનો સંપર્ક કરો અથવા URL તપાસો.',
      emptyQueue: 'આજની કતાર શરૂ થઈ નથી.',
      nowCalling: 'હમણાં બોલાવવામાં આવે છે',
      currentLabel: 'હાલ ચાલતો નંબર',
      nextLabel: 'આગળનો નંબર',
      waitingLabel: 'પ્રતીક્ષામાં',
    },

    analytics: {
      title: 'હોસ્પિટલના આંકડા',
      description: 'આ હોસ્પિટલમાં માસિક દર્દીઓની સંખ્યા, રાહનો સમય અને ડૉક્ટરોનો ભાર.',
      loading: 'આંકડા લોડ થઈ રહ્યા છે…',
      range: 'સમયગાળો',
      presets: {
        today: 'આજે',
        week: 'છેલ્લા ૭ દિવસ',
        month: 'આ મહિનો',
        lastMonth: 'છેલ્લો મહિનો',
        last30: 'છેલ્લા ૩૦ દિવસ',
        last90: 'છેલ્લા ૯૦ દિવસ',
        custom: 'કસ્ટમ',
      },
      from: 'થી',
      to: 'સુધી',
      date: 'તારીખ',
      apply: 'લાગુ કરો',
      doctor: 'ડૉક્ટર',
      allDoctors: 'બધા ડૉક્ટરો',
      summaryTitle: 'સારાંશ',
      summaryHint: 'પસંદ કરેલા સમયગાળાના કુલ આંકડા.',
      registered: 'નોંધણી',
      completed: 'પૂર્ણ',
      skipped: 'છોડી દીધા',
      waiting: 'રાહમાં',
      called: 'બોલાવ્યા',
      newPatients: 'નવા દર્દીઓ',
      followupPatients: 'ફોલો-અપ દર્દીઓ',
      avgWait: 'સરેરાશ રાહ',
      avgConsult: 'સરેરાશ તપાસ',
      peakHour: 'સૌથી વધુ ભીડનો સમય',
      dailyTrend: 'દૈનિક દર્દીઓનો પ્રવાહ',
      dailyTrendHint: 'દિવસ પ્રમાણે નોંધણી અને પૂર્ણ દર્દીઓ.',
      hourlyLoad: 'કલાક પ્રમાણે દર્દીઓ',
      hourlyLoadHint: 'દિવસ દરમિયાન દર્દીઓ ક્યારે આવે છે.',
      doctorLoad: 'ડૉક્ટર પ્રમાણે ભાર',
      doctorLoadHint: 'ડૉક્ટર પ્રમાણે નોંધણી અને પૂર્ણ દર્દીઓ.',
      hospitalLoad: 'હોસ્પિટલોની સરખામણી',
      hospitalLoadHint: 'હોસ્પિટલ પ્રમાણે નોંધણી અને પૂર્ણ દર્દીઓ.',
      noData: 'આ સમયગાળા માટે હજી આંકડા નથી.',
      exportCsv: 'CSV ડાઉનલોડ કરો',
      doctorsTableTitle: 'ડૉક્ટર સારાંશ',
      hospitalsTableTitle: 'હોસ્પિટલ સારાંશ',
      hospital: 'હોસ્પિટલ',
      allHospitals: 'બધી હોસ્પિટલો',
      platformTitle: 'બધી હોસ્પિટલો',
      platformDescription: 'બધી હોસ્પિટલોના એકત્રિત આંકડા અને સરખામણી.',
      platformLoading: 'બધી હોસ્પિટલોના આંકડા લોડ થઈ રહ્યા છે…',
      notAuthorized: 'આ પૃષ્ઠ જોવાની તમને પરવાનગી નથી.',
    },

    settings: {
      title: 'હોસ્પિટલ સેટિંગ્સ',
      description: 'આ માહિતી દર્દીઓને અને ટીવી ડિસ્પ્લે પર દેખાય છે.',
      loading: 'સેટિંગ્સ લોડ થઈ રહી છે…',
      loadFailed: 'હોસ્પિટલની માહિતી મળી નથી. કૃપા કરીને ફરી પ્રયાસ કરો.',
      name: 'હોસ્પિટલનું નામ',
      namePlaceholder: 'તમારી હોસ્પિટલનું નામ',
      address: 'સરનામું',
      phone: 'ફોન',
      timezone: 'ટાઈમ ઝોન',
      timezoneHint: 'કતાર દરરોજ મધ્યરાત્રિએ આ ટાઈમ ઝોન મુજબ નવેસરથી શરૂ થાય છે.',
      avgMinutes: 'સરેરાશ તપાસ સમય (મિનિટ)',
      avgHint: 'ફક્ત અંદાજિત પ્રતીક્ષા સમય દર્શાવવા માટે વપરાય છે.',
      displayMessage: 'ટીવી પરનો સંદેશ',
      displayMessagePlaceholder: 'કૃપા કરીને તમારા નંબરની રાહ જુઓ.',
      announceAloud: 'અવાજથી નંબર જાહેર કરો',
      saved: 'સેટિંગ્સ સાચવાઈ.',
      save: 'સાચવો',
    },

    queueTable: {
      caption: 'આજની દર્દી કતાર',
      token: 'ટોકન',
      patientName: 'દર્દીનું નામ',
      registeredAt: 'નોંધણી સમય',
      status: 'સ્થિતિ',
      actions: 'ક્રિયાઓ',
      call: 'બોલાવો',
      recall: 'ફરી બોલાવો',
      start: 'તપાસ શરૂ કરો',
      complete: 'પૂર્ણ',
      skip: 'છોડો',
      details: 'વિગતો',
      mobile: 'મોબાઈલ નંબર',
      patientType: 'દર્દીનો પ્રકાર',
      calledAt: 'બોલાવ્યાનો સમય',
    },

    registrationForm: {
      nameLabel: 'દર્દીનું નામ',
      namePlaceholder: 'દા.ત. રમેશ પટેલ',
      mobileLabel: 'મોબાઈલ નંબર',
      optional: '(વૈકલ્પિક)',
      mobilePlaceholder: 'દા.ત. ૯૮૭૬૫ ૪૩૨૧૦',
      mobileHint: 'આપો તો રિસેપ્શન તમારો સંપર્ક કરી શકે. ન આપો તો પણ ચાલે.',
      doctorLegend: 'ડૉક્ટર પસંદ કરો',
      patientTypeLegend: 'દર્દીનો પ્રકાર',
      privacyNote:
        'આ નોંધ ફક્ત કતારનું સંચાલન કરવા માટે છે. કૃપા કરીને અહીં તબીબી માહિતી ભરશો નહીં.',
      captchaRequired: 'ટોકન મેળવતા પહેલાં કૃપા કરીને સુરક્ષા ચકાસણી પૂર્ણ કરો.',
      submitting: 'નોંધણી થઈ રહી છે…',
      submit: 'ટોકન મેળવો',
    },

    doctorForm: {
      nameLabel: 'ડૉક્ટરનું નામ',
      namePlaceholder: 'દા.ત. ડૉ. અમોલ દેશમુખ',
      departmentLabel: 'વિભાગ',
      departmentPlaceholder: 'દા.ત. સામાન્ય દવા',
      roomLabel: 'રૂમ નંબર',
      roomPlaceholder: 'દા.ત. ૧',
      activeLabel: 'કતાર ચાલુ (નોંધણી ફોર્મમાં દેખાશે)',
      nameRequired: 'કૃપા કરીને ડૉક્ટરનું નામ ભરો.',
      save: 'સાચવો',
    },

    announcement: {
      turnOff: 'અવાજ બંધ કરો',
      turnOn: 'અવાજ ચાલુ કરો',
      turnedOnSpoken: 'અવાજ ચાલુ કર્યો છે.',
      unsupported: 'આ બ્રાઉઝરમાં પસંદ કરેલી ભાષા માટે અવાજ ઉપલબ્ધ નથી. કતાર તેમ છતાં યોગ્ય ચાલુ રહેશે.',
      fallbackVoice:
        'આ ભાષા માટે અવાજ મળ્યો નથી — બીજો અવાજ વપરાશે, તેથી ઉચ્ચાર જુદો હોઈ શકે.',
    },

    demo: {
      label: 'ડેમો મોડ — ડેટા ફક્ત આ બ્રાઉઝરમાં સાચવવામાં આવે છે',
      seed: (count) => `${toGujaratiNumber(count)} દર્દી ઉમેરો`,
      reset: 'ડેમો ડેટા સાફ કરો',
    },

    errorBoundary: {
      title: 'કંઈક તકનીકી સમસ્યા આવી છે.',
      description: 'કૃપા કરીને પાનું ફરી લોડ કરો. સમસ્યા ચાલુ રહે તો રિસેપ્શનનો સંપર્ક કરો.',
      reload: 'પાનું ફરી લોડ કરો',
    },

    tokenDetails: {
      doctor: 'ડૉક્ટર',
      department: 'વિભાગ',
      room: 'તપાસ રૂમ',
      date: 'તારીખ',
      hospital: 'હોસ્પિટલ',
      waitPrefix: 'અંદાજિત પ્રતીક્ષા સમય:',
      waitDisclaimer: 'આ ફક્ત અંદાજ છે — ખરેખર સમય થોડો ઓછો-વધુ હોઈ શકે.',
    },
  },
}
