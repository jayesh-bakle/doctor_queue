/**
 * Hindi.
 *
 * Shares Devanagari numerals with Marathi — `०२७` in both — so the numeral
 * helpers are reused rather than rewritten. The month names, the weekday
 * phrasing, the noun inflections and every sentence are Hindi's own.
 *
 * Written by the developer, not by a native Hindi speaker: the structure is
 * complete and the register is deliberately plain clinic Hindi, but the
 * patient-facing reassurance sentences deserve a native review before they go in
 * front of patients.
 */

import type { QueueStatus } from '../../types/database'
import { toMarathiDigits, toMarathiNumber, TOKEN_WIDTH } from '../marathiDigits'
import { dateParts, formatTime } from '../utils'
import type { Messages } from './types'

const months = [
  'जनवरी',
  'फ़रवरी',
  'मार्च',
  'अप्रैल',
  'मई',
  'जून',
  'जुलाई',
  'अगस्त',
  'सितंबर',
  'अक्टूबर',
  'नवंबर',
  'दिसंबर',
] as const

const weekdays = ['रविवार', 'सोमवार', 'मंगलवार', 'बुधवार', 'गुरुवार', 'शुक्रवार', 'शनिवार'] as const

/**
 * Hindi marks plurality far less than Marathi — `मरीज़` serves for both one and
 * many — so unlike the Marathi version this does not switch the noun. It is
 * still a function because the number has to be rendered in Devanagari.
 */
function hindiPatientCount(count: number): string {
  return `${toMarathiNumber(count)} मरीज़`
}

function hindiMinutes(minutes: number): string {
  const rounded = Math.max(0, Math.round(minutes))
  if (rounded === 0) return 'कुछ क्षण'
  return `${toMarathiNumber(rounded)} मिनट`
}

function formatHindiDate(date: Date, timeZone: string): string {
  const parts = dateParts(date, timeZone)
  if (!parts) return ''
  return `${toMarathiDigits(parts.day, 0)} ${months[parts.monthIndex]} ${toMarathiDigits(parts.year, 0)}`
}

function formatHindiDateWithWeekday(date: Date, timeZone: string): string {
  const parts = dateParts(date, timeZone)
  if (!parts) return ''
  return `${weekdays[parts.weekdayIndex]}, ${toMarathiDigits(parts.day, 0)} ${
    months[parts.monthIndex]
  } ${toMarathiDigits(parts.year, 0)}`
}

function asDate(iso: string | Date): Date {
  return typeof iso === 'string' ? new Date(iso) : iso
}

/** `कक्ष क्र. १` */
function roomShort(roomNumber: string): string {
  return `कक्ष क्र. ${toMarathiDigits(roomNumber, 0)}`
}

/** `कृपया जाँच कक्ष क्रमांक १ में जाएँ।` */
function roomInstruction(roomNumber: string): string {
  return `कृपया जाँच कक्ष क्रमांक ${toMarathiDigits(roomNumber, 0)} में जाएँ।`
}

const status: Record<QueueStatus, string> = {
  WAITING: 'प्रतीक्षा में',
  CALLED: 'बुलाया गया',
  IN_CONSULTATION: 'जाँच चल रही है',
  COMPLETED: 'पूर्ण',
  SKIPPED: 'छोड़ दिया',
}

export const hi: Messages = {
  name: 'हिंदी',

  token: (tokenNumber) => toMarathiDigits(tokenNumber, TOKEN_WIDTH),
  count: (value) => toMarathiNumber(value),
  digits: (value, width = 0) => toMarathiDigits(value, width),
  time: (iso, timeZone) => formatTime(iso, timeZone),
  date: (iso, timeZone) => formatHindiDate(asDate(iso), timeZone),
  dateWithWeekday: (iso, timeZone) => formatHindiDateWithWeekday(asDate(iso), timeZone),

  months,
  weekdays,

  patientCount: hindiPatientCount,
  minutes: hindiMinutes,

  status,
  patientType: {
    NEW: 'नया मरीज़',
    FOLLOWUP: 'दोबारा जाँच',
  },

  roomShort,
  roomInstruction,

  announcement: (tokenNumber, roomNumber) =>
    `टोकन क्रमांक ${toMarathiDigits(tokenNumber)}, कृपया जाँच कक्ष क्रमांक ${toMarathiDigits(
      roomNumber,
      0,
    )} में आएँ।`,

  patientsAhead: (count) => `आपसे आगे: ${hindiPatientCount(count)}`,
  waitingCount: (count) => `प्रतीक्षा में: ${toMarathiNumber(count)}`,

  describeSituation: ({ status: queueStatus, patientsAhead, roomNumber }) => {
    switch (queueStatus) {
      case 'SKIPPED':
        return {
          tone: 'attention',
          headline: 'आपका नंबर छोड़ दिया गया है।',
          detail: 'कृपया रिसेप्शन से संपर्क करें।',
          urgent: true,
        }

      case 'COMPLETED':
        return {
          tone: 'done',
          headline: 'आपकी जाँच पूरी हो गई है।',
          detail: 'आपकी विज़िट के लिए धन्यवाद। कृपया विदा लें।',
          urgent: false,
        }

      case 'IN_CONSULTATION':
        return {
          tone: 'now',
          headline: 'आपकी जाँच चल रही है।',
          detail: `कृपया जाँच कक्ष क्रमांक ${toMarathiDigits(roomNumber, 0)} में रहें।`,
          urgent: false,
        }

      case 'CALLED':
        return {
          tone: 'now',
          headline: 'अब आपका नंबर है।',
          detail: roomInstruction(roomNumber),
          urgent: true,
        }

      case 'WAITING':
      default:
        if (patientsAhead <= 0) {
          return {
            tone: 'soon',
            headline: 'आपका नंबर पास आ गया है।',
            detail: 'कृपया तैयार रहें — अगला नंबर आपका है।',
            urgent: true,
          }
        }
        if (patientsAhead <= 2) {
          return {
            tone: 'soon',
            headline: 'आपका नंबर पास आ रहा है।',
            detail: `${hindiPatientCount(patientsAhead)} आपसे आगे हैं। कृपया पास ही रहें।`,
            urgent: false,
          }
        }
        return {
          tone: 'waiting',
          headline: 'आपका पंजीकरण हो गया है। कृपया प्रतीक्षा करें।',
          detail: `${hindiPatientCount(patientsAhead)} आपसे आगे हैं।`,
          urgent: false,
        }
    }
  },

  errors: {
    NAME_REQUIRED: 'कृपया मरीज़ का नाम भरें।',
    NAME_TOO_LONG: 'नाम बहुत लंबा है। कृपया संक्षेप में लिखें।',
    INVALID_MOBILE: 'कृपया सही १० अंकों का मोबाइल नंबर भरें।',
    INVALID_PATIENT_TYPE: 'कृपया मरीज़ का प्रकार चुनें।',
    DOCTOR_REQUIRED: 'कृपया डॉक्टर चुनें।',
    DOCTOR_NOT_FOUND: 'अभी कतार उपलब्ध नहीं है। कृपया रिसेप्शन से संपर्क करें।',
    DOCTOR_INACTIVE: 'यह कतार अभी बंद है। कृपया रिसेप्शन से संपर्क करें।',
    DOCTOR_HAS_HISTORY:
      'इस डॉक्टर के पुराने मरीज़ रिकॉर्ड हैं, इसलिए इन्हें हटाया नहीं जा सकता। उनकी "कतार बंद" करें।',
    HOSPITAL_NOT_FOUND: 'अभी कतार उपलब्ध नहीं है। कृपया रिसेप्शन से संपर्क करें।',
    TOKEN_NOT_FOUND: 'यह टोकन नंबर नहीं मिला। कृपया रिसेप्शन से संपर्क करें।',
    NOT_AUTHORIZED: 'आपको यह कार्य करने की अनुमति नहीं है। कृपया दोबारा लॉगिन करें।',
    INVALID_STATUS_TRANSITION: 'यह कार्य अब नहीं किया जा सकता। कृपया पेज रीफ़्रेश करें।',
    INVALID_CREDENTIALS: 'ईमेल या पासवर्ड गलत है।',
    STAFF_NOT_LINKED: 'आपका खाता अस्पताल से जुड़ा नहीं है। कृपया व्यवस्थापक से संपर्क करें।',
    QUEUE_EMPTY: 'कतार में अभी कोई प्रतीक्षा में नहीं है।',
    INVALID_TIME_ZONE:
      'यह टाइम ज़ोन पहचाना नहीं गया। कृपया अंग्रेज़ी में "Asia/Kolkata" इस रूप में लिखें।',
    OFFLINE: 'इंटरनेट कनेक्शन जाँचें।',
    TIMEOUT: 'सर्वर से जवाब आने में समय लग रहा है। कृपया दोबारा कोशिश करें।',
    NETWORK: 'कुछ तकनीकी दिक्कत आ गई है। कृपया दोबारा कोशिश करें।',
    UNKNOWN: 'कुछ तकनीकी दिक्कत आ गई है। कृपया दोबारा कोशिश करें।',
  },

  ui: {
    common: {
      loading: 'कृपया थोड़ी प्रतीक्षा करें…',
      retry: 'दोबारा कोशिश करें',
      cancel: 'रद्द करें',
      hospitalFallback: 'आपके अस्पताल का नाम',
      queueSystem: 'मरीज़ कतार प्रबंधन',
      notProvided: 'नहीं दिया गया',
      online: 'जुड़ा हुआ है',
      connectionLost: 'कनेक्शन टूट गया',
      offline: 'इंटरनेट कनेक्शन जाँचें।',
      language: 'भाषा',
    },

    nav: {
      label: 'मुख्य मेन्यू',
      queue: 'कतार',
      doctors: 'डॉक्टर',
      settings: 'सेटिंग्स',
      qr: 'QR कोड',
    },

    staff: {
      checkingLogin: 'लॉगिन जाँचा जा रहा है…',
      role: 'रिसेप्शन',
      signOut: 'लॉगआउट',
    },

    patient: {
      help: 'सहायता के लिए:',
    },

    home: {
      register: 'कतार में पंजीकरण करें',
      registerHint: 'टोकन पाएँ और कतार देखें',
      staffLogin: 'रिसेप्शन लॉगिन',
      staffLoginHint: 'मरीज़ों को बुलाने के लिए',
    },

    register: {
      title: 'मरीज़ कतार में पंजीकरण',
      subtitle: 'नीचे जानकारी भरें और अपना टोकन नंबर पाएँ।',
      loadingDoctors: 'जानकारी लोड हो रही है…',
      emptyTitle: 'अभी कोई कतार उपलब्ध नहीं है।',
      emptyDescription: 'कृपया रिसेप्शन से संपर्क करें।',
    },

    token: {
      loading: 'आपका टोकन नंबर लाया जा रहा है…',
      notFoundTitle: 'यह टोकन नंबर नहीं मिला।',
      notFoundDescription: 'कृपया रिसेप्शन से संपर्क करें या दोबारा पंजीकरण करें।',
      registerAction: 'कतार में पंजीकरण करें',
      errorFallback: 'जानकारी नहीं मिली।',
      confirmed: 'पंजीकरण सफल',
      myToken: 'आपका टोकन नंबर',
      currentlyServing: 'अभी चल रहा',
      aheadOfYou: 'आपसे आगे',
      keepPhoneTitle: 'कृपया अपना फ़ोन पास रखें।',
      keepPhoneDetail: 'यह जानकारी अपने आप बदलती रहेगी — पेज रीफ़्रेश करने की ज़रूरत नहीं।',
      refreshNow: 'अभी रीफ़्रेश करें',
    },

    dashboard: {
      loadingDoctors: 'डॉक्टरों की जानकारी लोड हो रही है…',
      noDoctorsTitle: 'अभी कोई डॉक्टर नहीं जोड़ा गया।',
      noDoctorsDescription: 'कतार शुरू करने से पहले डॉक्टर जोड़ें।',
      addDoctor: 'डॉक्टर जोड़ें',
      selectDoctor: 'डॉक्टर चुनें',
      waiting: 'प्रतीक्षा में',
      totalToday: 'आज कुल',
      remaining: 'बाकी',
      currentlyServing: 'अभी चल रहा',
      callNext: 'अगले मरीज़ को बुलाएँ',
      nextToken: 'अगला नंबर:',
      nobodyWaiting: 'प्रतीक्षा में कोई नहीं',
      queueEmptyNotice: 'कतार में अभी कोई प्रतीक्षा में नहीं है।',
      openDisplay: 'टीवी डिस्प्ले खोलें',
      queueTitle: 'आज की कतार',
      queueCount: (count) => `कुल ${toMarathiNumber(count)} प्रविष्टियाँ`,
      queueLoading: 'कतार लोड हो रही है…',
      emptyQueueTitle: 'आज अभी किसी मरीज़ का पंजीकरण नहीं हुआ।',
      emptyQueueDescription: 'मरीज़ QR कोड स्कैन करके पंजीकरण करेंगे, तभी वे यहाँ दिखेंगे।',
    },

    doctors: {
      title: 'डॉक्टर प्रबंधन',
      description: 'कतार में दिखने वाले डॉक्टर यहाँ प्रबंधित करें।',
      addNew: 'नया डॉक्टर',
      addSubmit: 'डॉक्टर जोड़ें',
      loading: 'डॉक्टरों की जानकारी लोड हो रही है…',
      emptyTitle: 'अभी कोई डॉक्टर नहीं जोड़ा गया।',
      emptyDescription: 'कतार शुरू करने के लिए कम से कम एक डॉक्टर जोड़ें।',
      inactiveBadge: 'बंद',
      active: 'कतार चालू',
      inactive: 'कतार बंद',
      qr: 'QR',
      display: 'डिस्प्ले',
      edit: 'बदलें',
      delete: 'हटाएँ',
      deleteConfirm: (doctorName) => `${doctorName} को हटाएँ?`,
      deleteWarning:
        'यह डॉक्टर हमेशा के लिए हट जाएगा। अगर इस डॉक्टर के पुराने मरीज़ रिकॉर्ड हैं, तो हटाने की अनुमति नहीं होगी — तब उनकी "कतार बंद" करें।',
    },

    login: {
      checking: 'लॉगिन जाँचा जा रहा है…',
      subtitle: 'रिसेप्शन लॉगिन',
      email: 'ईमेल',
      password: 'पासवर्ड',
      submitting: 'लॉगिन हो रहा है…',
      submit: 'लॉगिन करें',
      backHome: 'मुख्य पेज पर वापस जाएँ',
      demoMode: 'डेमो मोड:',
    },

    notFound: {
      title: 'यह पेज नहीं मिला।',
      description: 'कृपया रिसेप्शन द्वारा दिया गया लिंक जाँचें या मुख्य पेज पर जाएँ।',
      home: 'मुख्य पेज',
    },

    qr: {
      title: 'QR कोड',
      description: 'यह QR कोड छापकर रिसेप्शन पर लगाएँ। मरीज़ स्कैन करके पंजीकरण करेंगे।',
      download: 'PNG डाउनलोड',
      print: 'छापें',
      forWhom: 'किसके लिए?',
      allDoctors: 'सभी डॉक्टर (सामान्य QR)',
      doctorHint: 'किसी डॉक्टर का QR स्कैन करने पर उस डॉक्टर का चयन अपने आप हो जाता है।',
      addressInQr: 'QR में दिया पता:',
      generateFailed: 'QR कोड बनाया नहीं जा सका। कृपया पेज रीफ़्रेश करें।',
      qrAlt: (url) => `पंजीकरण पते के लिए QR कोड: ${url}`,
      posterHeading: 'कतार में पंजीकरण के लिए QR कोड स्कैन करें',
      scanInstruction: 'QR कोड स्कैन करें',
      getTokenOnMobile: 'अपना टोकन नंबर मोबाइल पर पाएँ',
      steps: [
        '१. मोबाइल का कैमरा खोलें।',
        '२. यह QR कोड कैमरे के सामने रखें।',
        '३. दिखने वाला लिंक खोलें।',
        '४. नाम और डॉक्टर चुनकर टोकन पाएँ।',
      ],
      noMobile: 'मोबाइल न हो तो रिसेप्शन पर पंजीकरण करें।',
      displayLinksTitle: 'टीवी डिस्प्ले लिंक',
      displayLinksDescription: 'यह लिंक टीवी, मॉनिटर या टैबलेट पर खोलें। मरीज़ों के नाम यहाँ नहीं दिखते।',
      noDoctorsTitle: 'अभी कोई डॉक्टर नहीं जोड़ा गया।',
      noDoctorsDescription: 'डिस्प्ले लिंक पाने के लिए पहले डॉक्टर जोड़ें।',
    },

    display: {
      loading: 'जानकारी लोड हो रही है…',
      unavailable: 'यह डिस्प्ले उपलब्ध नहीं है।',
      checkUrl: 'कृपया रिसेप्शन से संपर्क करें या URL जाँचें।',
      emptyQueue: 'आज की कतार शुरू नहीं हुई है।',
      currentLabel: 'अभी चल रहा नंबर',
      nextLabel: 'अगला नंबर',
      waitingLabel: 'प्रतीक्षा में',
    },

    settings: {
      title: 'अस्पताल सेटिंग्स',
      description: 'यह जानकारी मरीज़ों और टीवी डिस्प्ले पर दिखती है।',
      loading: 'सेटिंग्स लोड हो रही हैं…',
      loadFailed: 'अस्पताल की जानकारी नहीं मिली। कृपया दोबारा कोशिश करें।',
      name: 'अस्पताल का नाम',
      namePlaceholder: 'आपके अस्पताल का नाम',
      address: 'पता',
      phone: 'फ़ोन',
      timezone: 'टाइम ज़ोन',
      timezoneHint: 'कतार हर रोज़ आधी रात को इस टाइम ज़ोन के अनुसार नए सिरे से शुरू होती है।',
      avgMinutes: 'औसत जाँच समय (मिनट)',
      avgHint: 'सिर्फ़ अनुमानित प्रतीक्षा समय दिखाने के लिए इस्तेमाल होता है।',
      displayMessage: 'टीवी पर संदेश',
      displayMessagePlaceholder: 'कृपया अपने नंबर का इंतज़ार करें।',
      announceAloud: 'आवाज़ से नंबर की घोषणा करें',
      saved: 'सेटिंग्स सहेजी गईं।',
      save: 'सहेजें',
    },

    queueTable: {
      caption: 'आज की मरीज़ कतार',
      token: 'टोकन',
      patientName: 'मरीज़ का नाम',
      registeredAt: 'पंजीकरण समय',
      status: 'स्थिति',
      actions: 'कार्य',
      call: 'बुलाएँ',
      recall: 'दोबारा बुलाएँ',
      start: 'जाँच शुरू',
      complete: 'पूर्ण',
      skip: 'छोड़ें',
      details: 'विवरण',
      mobile: 'मोबाइल नंबर',
      patientType: 'मरीज़ का प्रकार',
      calledAt: 'बुलाने का समय',
    },

    registrationForm: {
      nameLabel: 'मरीज़ का नाम',
      namePlaceholder: 'उदा. रमेश वर्मा',
      mobileLabel: 'मोबाइल नंबर',
      optional: '(वैकल्पिक)',
      mobilePlaceholder: 'उदा. ९८७६५ ४३२१०',
      mobileHint: 'देने पर रिसेप्शन आपसे संपर्क कर सकता है। न देने पर भी चलेगा।',
      doctorLegend: 'डॉक्टर चुनें',
      patientTypeLegend: 'मरीज़ का प्रकार',
      privacyNote: 'यह प्रविष्टि केवल कतार प्रबंधन के लिए है। कृपया यहाँ चिकित्सकीय जानकारी न भरें।',
      submitting: 'पंजीकरण हो रहा है…',
      submit: 'टोकन पाएँ',
    },

    doctorForm: {
      nameLabel: 'डॉक्टर का नाम',
      namePlaceholder: 'उदा. डॉ. अमोल देशमुख',
      departmentLabel: 'विभाग',
      departmentPlaceholder: 'उदा. सामान्य चिकित्सा',
      roomLabel: 'कक्ष क्रमांक',
      roomPlaceholder: 'उदा. १',
      activeLabel: 'कतार चालू (पंजीकरण फ़ॉर्म में दिखेगा)',
      nameRequired: 'कृपया डॉक्टर का नाम भरें।',
      save: 'सहेजें',
    },

    announcement: {
      turnOff: 'आवाज़ बंद करें',
      turnOn: 'आवाज़ चालू करें',
      turnedOnSpoken: 'आवाज़ चालू कर दी गई है।',
      unsupported: 'इस ब्राउज़र में हिंदी आवाज़ उपलब्ध नहीं है। कतार फिर भी सही चलेगी।',
      fallbackVoice: 'हिंदी आवाज़ नहीं मिली — दूसरी आवाज़ इस्तेमाल होगी। उच्चार थोड़ा अलग हो सकता है।',
    },

    demo: {
      label: 'डेमो मोड — डेटा सिर्फ़ इस ब्राउज़र में रखा जाता है',
      seed: (count) => `${toMarathiNumber(count)} मरीज़ जोड़ें`,
      reset: 'डेमो डेटा साफ़ करें',
    },

    errorBoundary: {
      title: 'कुछ तकनीकी दिक्कत आ गई है।',
      description: 'कृपया पेज दोबारा लोड करें। दिक्कत बनी रहे तो रिसेप्शन से संपर्क करें।',
      reload: 'पेज दोबारा लोड करें',
    },

    tokenDetails: {
      doctor: 'डॉक्टर',
      department: 'विभाग',
      room: 'जाँच कक्ष',
      date: 'तारीख़',
      hospital: 'अस्पताल',
      waitPrefix: 'अनुमानित प्रतीक्षा समय:',
      waitDisclaimer: 'यह केवल अनुमान है — असली समय थोड़ा कम-ज़्यादा हो सकता है।',
    },
  },
}
