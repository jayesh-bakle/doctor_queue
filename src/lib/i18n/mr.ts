/**
 * Marathi — the default, and the language the clinic actually runs on.
 *
 * Every string here is byte-identical to what the app rendered when it was
 * Marathi-only, which is why the Devanagari assertions in the existing test
 * suite mostly survive the introduction of a language switcher unchanged.
 *
 * The numeral and date machinery is not re-implemented: it delegates to
 * `marathiDigits.ts` and `utils.ts`, where it has always lived and where it is
 * still asserted. Only the *wording* is this module's business.
 */

import type { QueueStatus } from '../../types/database'
import { patientCountLabel, minutesLabel, toMarathiDigits, toMarathiNumber, TOKEN_WIDTH } from '../marathiDigits'
import { formatDate, formatDateWithWeekday, formatTime } from '../utils'
import type { Messages } from './types'

const months = [
  'जानेवारी',
  'फेब्रुवारी',
  'मार्च',
  'एप्रिल',
  'मे',
  'जून',
  'जुलै',
  'ऑगस्ट',
  'सप्टेंबर',
  'ऑक्टोबर',
  'नोव्हेंबर',
  'डिसेंबर',
] as const

const weekdays = ['रविवार', 'सोमवार', 'मंगळवार', 'बुधवार', 'गुरुवार', 'शुक्रवार', 'शनिवार'] as const

const status: Record<QueueStatus, string> = {
  WAITING: 'प्रतीक्षेत',
  CALLED: 'बोलावले',
  IN_CONSULTATION: 'तपासणी सुरू',
  COMPLETED: 'पूर्ण',
  SKIPPED: 'वगळले',
}

/** `कक्ष क्र. १` — short form for headers and cards. */
function roomShort(roomNumber: string): string {
  return `कक्ष क्र. ${toMarathiDigits(roomNumber, 0)}`
}

/** `कृपया तपासणी कक्ष क्रमांक १ मध्ये जा.` */
function roomInstruction(roomNumber: string): string {
  return `कृपया तपासणी कक्ष क्रमांक ${toMarathiDigits(roomNumber, 0)} मध्ये जा.`
}

export const mr: Messages = {
  name: 'मराठी',

  token: (tokenNumber) => toMarathiDigits(tokenNumber, TOKEN_WIDTH),
  count: (value) => toMarathiNumber(value),
  digits: (value, width = 0) => toMarathiDigits(value, width),
  time: (iso, timeZone) => formatTime(iso, timeZone),
  date: (iso, timeZone) => formatDate(iso, timeZone),
  dateWithWeekday: (iso, timeZone) => formatDateWithWeekday(iso, timeZone),

  months,
  weekdays,

  patientCount: (count) => patientCountLabel(count),
  minutes: (minutes) => minutesLabel(minutes),

  status,
  patientType: {
    NEW: 'नवीन रुग्ण',
    FOLLOWUP: 'पुनर्तपासणी',
  },

  roomShort,
  roomInstruction,

  /** Spec §13: `टोकन क्रमांक ०२७, कृपया तपासणी कक्ष क्रमांक १ मध्ये या.` */
  announcement: (tokenNumber, roomNumber) =>
    `टोकन क्रमांक ${toMarathiDigits(tokenNumber)}, कृपया तपासणी कक्ष क्रमांक ${toMarathiDigits(
      roomNumber,
      0,
    )} मध्ये या.`,

  /** `आपल्यापुढे: ३ रुग्णे` */
  patientsAhead: (count) => `आपल्यापुढे: ${patientCountLabel(count)}`,

  /** `प्रतीक्षेत: १२` */
  waitingCount: (count) => `प्रतीक्षेत: ${toMarathiNumber(count)}`,

  /**
   * Turns raw queue state into the single sentence the patient should read.
   *
   * Order matters: a terminal status (COMPLETED, SKIPPED) always wins, because a
   * patient who has already been seen must not be told to keep waiting just
   * because other tokens are still moving.
   */
  describeSituation: ({ status: queueStatus, patientsAhead, roomNumber }) => {
    switch (queueStatus) {
      case 'SKIPPED':
        return {
          tone: 'attention',
          headline: 'आपला क्रमांक वगळण्यात आला आहे.',
          detail: 'कृपया रिसेप्शनशी संपर्क साधा.',
          urgent: true,
        }

      case 'COMPLETED':
        return {
          tone: 'done',
          headline: 'आपली तपासणी पूर्ण झाली आहे.',
          detail: 'आपल्या भेटीबद्दल धन्यवाद. कृपया निरोप घ्या.',
          urgent: false,
        }

      case 'IN_CONSULTATION':
        return {
          tone: 'now',
          headline: 'आपली तपासणी सुरू आहे.',
          detail: `कृपया तपासणी कक्ष क्रमांक ${toMarathiDigits(roomNumber, 0)} मध्ये राहा.`,
          urgent: false,
        }

      case 'CALLED':
        return {
          tone: 'now',
          headline: 'आता आपला क्रमांक आहे.',
          detail: roomInstruction(roomNumber),
          urgent: true,
        }

      case 'WAITING':
      default:
        if (patientsAhead <= 0) {
          return {
            tone: 'soon',
            headline: 'आपला क्रमांक जवळ आला आहे.',
            detail: 'कृपया तयार राहा — पुढील क्रमांक आपला आहे.',
            urgent: true,
          }
        }
        if (patientsAhead <= 2) {
          return {
            tone: 'soon',
            headline: 'आपला क्रमांक जवळ येत आहे.',
            detail: `${patientCountLabel(patientsAhead)} आपल्यापुढे आहेत. कृपया जवळच राहा.`,
            urgent: false,
          }
        }
        return {
          tone: 'waiting',
          headline: 'आपली नोंदणी झाली आहे. कृपया प्रतीक्षा करा.',
          detail: `${patientCountLabel(patientsAhead)} आपल्यापुढे आहेत.`,
          urgent: false,
        }
    }
  },

  errors: {
    NAME_REQUIRED: 'कृपया रुग्णाचे नाव भरा.',
    NAME_TOO_LONG: 'नाव खूप मोठे आहे. कृपया थोडक्यात लिहा.',
    INVALID_MOBILE: 'कृपया योग्य १० अंकी मोबाईल क्रमांक भरा.',
    INVALID_PATIENT_TYPE: 'कृपया रुग्णाचा प्रकार निवडा.',
    DOCTOR_REQUIRED: 'कृपया डॉक्टर निवडा.',
    DOCTOR_NOT_FOUND: 'सध्या रांग उपलब्ध नाही. कृपया रिसेप्शनशी संपर्क साधा.',
    DOCTOR_INACTIVE: 'ही रांग सध्या बंद आहे. कृपया रिसेप्शनशी संपर्क साधा.',
    DOCTOR_HAS_HISTORY:
      'या डॉक्टरकडे जुन्या रुग्णनोंदी आहेत, म्हणून काढता येत नाही. नवीन नोंदणी थांबवण्यासाठी "बदला" उघडा आणि "रांग सुरू" टिक काढून टाका — जुन्या नोंदी सुरक्षित राहतील.',
    HOSPITAL_NOT_FOUND: 'सध्या रांग उपलब्ध नाही. कृपया रिसेप्शनशी संपर्क साधा.',
    TOKEN_NOT_FOUND: 'हा टोकन क्रमांक सापडला नाही. कृपया रिसेप्शनशी संपर्क साधा.',
    NOT_AUTHORIZED: 'आपल्याला ही कृती करण्याची परवानगी नाही. कृपया पुन्हा लॉगिन करा.',
    INVALID_STATUS_TRANSITION: 'ही कृती आता करता येत नाही. कृपया पान ताजे करा.',
    INVALID_CREDENTIALS: 'ईमेल किंवा पासवर्ड चुकीचा आहे.',
    STAFF_NOT_LINKED: 'आपले खाते रुग्णालयाशी जोडलेले नाही. कृपया प्रशासकाशी संपर्क साधा.',
    QUEUE_EMPTY: 'रांगेत आता कोणीही प्रतीक्षेत नाही.',
    QUEUE_FULL: 'आजची ही रांग पूर्ण झाली आहे. कृपया रिसेप्शनशी संपर्क साधा.',
    TURNSTILE_FAILED:
      'सुरक्षा तपासणी पूर्ण झाली नाही. कृपया पृष्ठ पुन्हा लोड करून प्रयत्न करा.',
    INVALID_TIME_ZONE:
      'हा टाइम झोन ओळखला जात नाही. कृपया इंग्रजीत "Asia/Kolkata" या स्वरूपात लिहा.',
    OFFLINE: 'इंटरनेट कनेक्शन तपासा.',
    TIMEOUT: 'सर्व्हरला उत्तर द्यायला वेळ लागत आहे. कृपया पुन्हा प्रयत्न करा.',
    NETWORK: 'काहीतरी तांत्रिक अडचण आली आहे. कृपया पुन्हा प्रयत्न करा.',
    UNKNOWN: 'काहीतरी तांत्रिक अडचण आली आहे. कृपया पुन्हा प्रयत्न करा.',
  },

  ui: {
    common: {
      loading: 'कृपया थोडी वाट पाहा…',
      retry: 'पुन्हा प्रयत्न करा',
      cancel: 'रद्द करा',
      hospitalFallback: 'आपल्या रुग्णालयाचे नाव',
      queueSystem: 'रुग्ण रांग व्यवस्थापन',
      appDescription: 'क्लिनिकसाठी रुग्ण रांग आणि टोकन व्यवस्थापन.',
      notProvided: 'दिलेला नाही',
      online: 'जोडलेले आहे',
      connectionLost: 'कनेक्शन खंडित',
      offline: 'इंटरनेट कनेक्शन तपासा.',
      language: 'भाषा',
    },

    nav: {
      label: 'मुख्य मेनू',
      queue: 'रांग',
      analytics: 'आकडेवारी',
      admin: 'सर्व रुग्णालये',
      doctors: 'डॉक्टर',
      settings: 'सेटिंग्ज',
      qr: 'QR कोड',
    },

    staff: {
      checkingLogin: 'लॉगिन तपासत आहे…',
      role: 'रिसेप्शन',
      signOut: 'बाहेर पडा',
    },

    patient: {
      help: 'मदतीसाठी:',
    },

    home: {
      staffLogin: 'रिसेप्शन लॉगिन',
      staffLoginHint: 'रुग्णांना बोलावण्यासाठी',
      patientHint: 'रुग्णांसाठी: रिसेप्शनवर असलेला QR कोड स्कॅन करा.',
    },

    register: {
      title: 'रुग्ण रांगेत नोंदणी',
      subtitle: 'खालील माहिती भरा आणि आपला टोकन क्रमांक मिळवा.',
      loadingDoctors: 'माहिती लोड होत आहे…',
      emptyTitle: 'सध्या रांग उपलब्ध नाही.',
      emptyDescription: 'कृपया रिसेप्शनशी संपर्क साधा.',
      hospitalMissingTitle: 'हे रुग्णालय सापडले नाही.',
      hospitalMissingDescription:
        'कृपया रिसेप्शनवर असलेला QR कोड पुन्हा स्कॅन करा किंवा रिसेप्शनशी संपर्क साधा.',
      queueSummaryTitle: 'आत्ताची रांग',
      nowServing: 'सध्या चालू',
      waitingLabel: 'प्रतीक्षेत',
    },

    token: {
      loading: 'आपला टोकन क्रमांक मिळवत आहे…',
      notFoundTitle: 'हा टोकन क्रमांक सापडला नाही.',
      notFoundDescription: 'कृपया रिसेप्शनशी संपर्क साधा किंवा पुन्हा नोंदणी करा.',
      registerAction: 'रांगेत नोंदणी करा',
      errorFallback: 'माहिती मिळाली नाही.',
      confirmed: 'नोंदणी यशस्वी',
      myToken: 'आपला टोकन क्रमांक',
      currentlyServing: 'सध्या सुरू',
      aheadOfYou: 'आपल्यापुढे',
      keepPhoneTitle: 'कृपया आपला फोन जवळ ठेवा.',
      keepPhoneDetail: 'ही माहिती आपोआप बदलत राहील — पान ताजे करण्याची गरज नाही.',
      refreshNow: 'आत्ता ताजे करा',
    },

    dashboard: {
      loadingDoctors: 'डॉक्टरांची माहिती लोड होत आहे…',
      noDoctorsTitle: 'अजून एकही डॉक्टर जोडलेले नाहीत.',
      noDoctorsDescription: 'रांग सुरू करण्यापूर्वी डॉक्टर जोडा.',
      addDoctor: 'डॉक्टर जोडा',
      selectDoctor: 'डॉक्टर निवडा',
      waiting: 'प्रतीक्षेत',
      totalToday: 'एकूण आज',
      remaining: 'बाकी',
      currentlyServing: 'सध्या सुरू',
      callNext: 'पुढील रुग्ण बोलवा',
      nextToken: 'पुढील क्रमांक:',
      nobodyWaiting: 'प्रतीक्षेत कोणी नाही',
      queueEmptyNotice: 'रांगेत आता कोणीही प्रतीक्षेत नाही.',
      openDisplay: 'टीव्ही डिस्प्ले उघडा',
      queueTitle: 'आजची रांग',
      queueCount: (count) => `एकूण ${toMarathiNumber(count)} नोंदी`,
      queueLoading: 'रांग लोड होत आहे…',
      emptyQueueTitle: 'आज अजून एकही रुग्ण नोंदणी झालेला नाही.',
      emptyQueueDescription: 'रुग्ण QR कोड स्कॅन करून नोंदणी करतील, तसे ते येथे दिसतील.',
      todayAtAGlance: 'आज एका दृष्टिक्षेपात',
      todayHint: 'आजचे एकूण आकडे, सर्व डॉक्टर.',
      todayLoading: 'आजची आकडेवारी लोड होत आहे…',
      todayRegistered: 'नोंदणी',
      todayCompleted: 'पूर्ण',
      todayWaiting: 'प्रतीक्षेत',
      todaySkipped: 'वगळले',
      todayAvgWait: 'सरासरी प्रतीक्षा',
      todayPeakHour: 'सर्वाधिक गर्दीची वेळ',
    },

    doctors: {
      title: 'डॉक्टर व्यवस्थापन',
      description: 'रांगेत दिसणारे डॉक्टर येथे व्यवस्थापित करा.',
      addNew: 'नवीन डॉक्टर',
      addSubmit: 'डॉक्टर जोडा',
      loading: 'डॉक्टरांची माहिती लोड होत आहे…',
      emptyTitle: 'अजून एकही डॉक्टर जोडलेले नाहीत.',
      emptyDescription: 'रांग सुरू करण्यासाठी किमान एक डॉक्टर जोडा.',
      inactiveBadge: 'बंद',
      active: 'रांग सुरू',
      inactive: 'रांग बंद',
      qr: 'QR',
      display: 'डिस्प्ले',
      edit: 'बदला',
      delete: 'काढा',
      deleteConfirm: (doctorName) => `${doctorName} यांना काढायचे?`,
      deleteWarning:
        'हा डॉक्टर कायमचा काढला जाईल. जर या डॉक्टरकडे जुन्या रुग्णनोंदी असतील, तर काढणे थांबवले जाईल — तेव्हा "बदला" मध्ये "रांग सुरू" टिक काढून टाका.',
    },

    login: {
      checking: 'लॉगिन तपासत आहे…',
      subtitle: 'रिसेप्शन लॉगिन',
      email: 'ईमेल',
      password: 'पासवर्ड',
      submitting: 'लॉगिन होत आहे…',
      submit: 'लॉगिन करा',
      backHome: 'मुख्य पानावर परत जा',
      demoMode: 'डेमो मोड:',
      hospitalMissingTitle: 'हे रुग्णालय सापडले नाही.',
      hospitalMissingDescription:
        'लॉगिनची लिंक चुकीची आहे. कृपया या रुग्णालयाची योग्य लिंक वापरा किंवा व्यवस्थापकाशी संपर्क साधा.',
      wrongHospital:
        'हे खाते या रुग्णालयाशी जोडलेले नाही. कृपया या रुग्णालयाच्या कर्मचाऱ्याच्या खात्याने लॉगिन करा.',
    },

    notFound: {
      title: 'हे पान सापडले नाही.',
      description: 'कृपया रिसेप्शनने दिलेली लिंक तपासा किंवा मुख्य पानावर जा.',
      home: 'मुख्य पान',
    },

    qr: {
      title: 'QR कोड',
      description: 'हा QR कोड छापून रिसेप्शनवर लावा. रुग्ण स्कॅन करून नोंदणी करतील.',
      download: 'PNG डाउनलोड',
      print: 'छापा',
      forWhom: 'कोणासाठी?',
      allDoctors: 'सर्व डॉक्टर (सामान्य QR)',
      doctorHint: 'विशिष्ट डॉक्टरचा QR स्कॅन केल्यास त्या डॉक्टरची निवड आपोआप होते.',
      addressInQr: 'QR मधील पत्ता:',
      generateFailed: 'QR कोड तयार करता आला नाही. कृपया पान ताजे करा.',
      qrAlt: (url) => `नोंदणी पत्त्यासाठी QR कोड: ${url}`,
      posterHeading: 'रांगेत नोंदणी करण्यासाठी QR कोड स्कॅन करा',
      scanInstruction: 'QR कोड स्कॅन करा',
      getTokenOnMobile: 'आपला टोकन क्रमांक मोबाईलवर मिळवा',
      steps: [
        '१. मोबाईलचा कॅमेरा उघडा.',
        '२. हा QR कोड कॅमेऱ्यासमोर धरा.',
        '३. दिसणारी लिंक उघडा.',
        '४. नाव व डॉक्टर निवडून टोकन मिळवा.',
      ],
      noMobile: 'मोबाईल नसल्यास रिसेप्शनवर नोंदणी करा.',
      displayLinksTitle: 'टीव्ही डिस्प्ले लिंक',
      displayLinksDescription:
        'ही लिंक टीव्ही, मॉनिटर किंवा टॅबलेटवर उघडा. यावर सर्व सक्रिय डॉक्टर दिसतात; रुग्णांची नावे दिसत नाहीत.',
      noDoctorsTitle: 'अजून डॉक्टर जोडलेले नाहीत.',
      noDoctorsDescription: 'डिस्प्ले लिंक मिळवण्यासाठी आधी डॉक्टर जोडा.',
      staffLinkTitle: 'रिसेप्शन लॉगिन लिंक',
      staffLinkDescription:
        'ही लिंक या रुग्णालयाच्या रिसेप्शनसाठी जतन करा. या लिंकवरून लॉगिन केल्यावर याच रुग्णालयाचे नाव दिसते.',
      copyLink: 'कॉपी करा',
      copied: 'कॉपी झाली',
    },

    display: {
      loading: 'माहिती लोड होत आहे…',
      unavailable: 'हा डिस्प्ले उपलब्ध नाही.',
      checkUrl: 'कृपया रिसेप्शनशी संपर्क साधा किंवा URL तपासा.',
      emptyQueue: 'आजची रांग सुरू झालेली नाही.',
      nowCalling: 'आता बोलावले जात आहे',
      currentLabel: 'सध्या सुरू असलेला क्रमांक',
      nextLabel: 'पुढील क्रमांक',
      waitingLabel: 'प्रतीक्षेत',
    },

    analytics: {
      title: 'रुग्णालयाची आकडेवारी',
      description: 'या रुग्णालयातील मासिक रुग्णसंख्या, प्रतीक्षा वेळ आणि डॉक्टरांचा भार.',
      loading: 'आकडेवारी लोड होत आहे…',
      range: 'कालावधी',
      presets: {
        today: 'आज',
        week: 'मागील ७ दिवस',
        month: 'हा महिना',
        lastMonth: 'मागील महिना',
        last30: 'मागील ३० दिवस',
        last90: 'मागील ९० दिवस',
        custom: 'स्वतःचा',
      },
      from: 'पासून',
      to: 'पर्यंत',
      date: 'दिनांक',
      apply: 'लागू करा',
      doctor: 'डॉक्टर',
      allDoctors: 'सर्व डॉक्टर',
      summaryTitle: 'सारांश',
      summaryHint: 'निवडलेल्या कालावधीतील एकूण आकडे.',
      registered: 'नोंदणी',
      completed: 'पूर्ण',
      skipped: 'वगळले',
      waiting: 'प्रतीक्षेत',
      called: 'बोलावले',
      newPatients: 'नवीन रुग्ण',
      followupPatients: 'फॉलो-अप रुग्ण',
      avgWait: 'सरासरी प्रतीक्षा',
      avgConsult: 'सरासरी तपासणी',
      peakHour: 'सर्वाधिक गर्दीची वेळ',
      dailyTrend: 'दैनिक रुग्णसंख्या',
      dailyTrendHint: 'दिवसानुसार नोंदणी आणि पूर्ण रुग्ण.',
      hourlyLoad: 'तासानुसार रुग्ण',
      hourlyLoadHint: 'दिवसातील कोणत्या वेळी रुग्ण येतात.',
      doctorLoad: 'डॉक्टरांनुसार भार',
      doctorLoadHint: 'डॉक्टरांनुसार नोंदणी आणि पूर्ण रुग्ण.',
      hospitalLoad: 'रुग्णालयांची तुलना',
      hospitalLoadHint: 'रुग्णालयांनुसार नोंदणी आणि पूर्ण रुग्ण.',
      noData: 'या कालावधीसाठी अजून आकडेवारी नाही.',
      exportCsv: 'CSV डाउनलोड करा',
      doctorsTableTitle: 'डॉक्टर सारांश',
      hospitalsTableTitle: 'रुग्णालय सारांश',
      hospital: 'रुग्णालय',
      allHospitals: 'सर्व रुग्णालये',
      platformTitle: 'सर्व रुग्णालये',
      platformDescription: 'सर्व रुग्णालयांचे एकत्रित आकडे आणि तुलना.',
      platformLoading: 'सर्व रुग्णालयांची आकडेवारी लोड होत आहे…',
      notAuthorized: 'हे पृष्ठ पाहण्याची तुम्हाला परवानगी नाही.',
    },

    settings: {
      title: 'रुग्णालय सेटिंग्ज',
      description: 'ही माहिती रुग्ण आणि टीव्ही डिस्प्लेवर दिसते.',
      loading: 'सेटिंग्ज लोड होत आहेत…',
      loadFailed: 'रुग्णालयाची माहिती मिळाली नाही. कृपया पुन्हा प्रयत्न करा.',
      name: 'रुग्णालयाचे नाव',
      namePlaceholder: 'आपल्या रुग्णालयाचे नाव',
      address: 'पत्ता',
      phone: 'दूरध्वनी',
      phonePlaceholder: '+९१ २० १२३४ ५६७८',
      timezone: 'टाइम झोन',
      timezonePlaceholder: 'Asia/Kolkata',
      timezoneHint: 'रांग दररोज मध्यरात्री या टाइम झोननुसार नव्याने सुरू होते.',
      avgMinutes: 'सरासरी तपासणी वेळ (मिनिटे)',
      avgHint: 'फक्त अंदाजे प्रतीक्षा वेळ दाखवण्यासाठी वापरला जातो.',
      displayMessage: 'टीव्हीवरील संदेश',
      displayMessagePlaceholder: 'कृपया आपल्या क्रमांकाची वाट पाहा.',
      displayMessageMr: 'मराठीत संदेश',
      displayMessageGu: 'गुजरातीत संदेश',
      announceAloud: 'आवाजाद्वारे क्रमांक जाहीर करा',
      saved: 'सेटिंग्ज जतन झाल्या.',
      save: 'जतन करा',
    },

    queueTable: {
      caption: 'आजची रुग्ण रांग',
      token: 'टोकन',
      patientName: 'रुग्णाचे नाव',
      registeredAt: 'नोंदणी वेळ',
      status: 'स्थिती',
      actions: 'कृती',
      call: 'बोलवा',
      recall: 'पुन्हा बोलवा',
      start: 'तपासणी सुरू',
      complete: 'पूर्ण',
      skip: 'वगळा',
      details: 'तपशील',
      mobile: 'मोबाईल क्रमांक',
      patientType: 'रुग्णाचा प्रकार',
      calledAt: 'बोलावल्याची वेळ',
    },

    registrationForm: {
      nameLabel: 'रुग्णाचे नाव',
      namePlaceholder: 'उदा. संदीप जाधव',
      mobileLabel: 'मोबाईल क्रमांक',
      optional: '(ऐच्छिक)',
      mobilePlaceholder: 'उदा. ९८७६५ ४३२१०',
      mobileHint: 'दिल्यास रिसेप्शनला आपल्याशी संपर्क साधता येईल. न दिल्यासही चालेल.',
      doctorLegend: 'डॉक्टर निवडा',
      patientTypeLegend: 'रुग्णाचा प्रकार',
      privacyNote: 'ही नोंद फक्त रांगेचे व्यवस्थापन करण्यासाठी आहे. कृपया वैद्यकीय माहिती येथे भरू नका.',
      captchaRequired: 'टोकन मिळवण्यापूर्वी कृपया सुरक्षा तपासणी पूर्ण करा.',
      submitting: 'नोंदणी सुरू आहे…',
      submit: 'टोकन मिळवा',
    },

    doctorForm: {
      nameLabel: 'डॉक्टरांचे नाव',
      namePlaceholder: 'उदा. डॉ. अमोल देशमुख',
      departmentLabel: 'विभाग',
      departmentPlaceholder: 'उदा. सामान्य वैद्यक',
      departmentTranslations: 'विभागाचे भाषांतर',
      roomLabel: 'कक्ष क्रमांक',
      roomPlaceholder: 'उदा. १',
      activeLabel: 'रांग सुरू (नोंदणी फॉर्ममध्ये दिसेल)',
      nameRequired: 'कृपया डॉक्टरांचे नाव भरा.',
      save: 'जतन करा',
    },

    announcement: {
      turnOff: 'आवाज बंद करा',
      turnOn: 'आवाज सुरू करा',
      turnedOnSpoken: 'आवाज सुरू केला आहे.',
      unsupported: 'हा ब्राउझर आवाज वाजवू शकत नाही. रांग मात्र योग्य चालू राहील.',
      usingVoice: (voiceName) => `वापरला जाणारा आवाज: ${voiceName}`,
      fallbackVoice:
        'या भाषेसाठी आवाज सापडला नाही — डिव्हाइसचा डीफॉल्ट आवाज वापरला जाईल, त्यामुळे उच्चार चुकीचा असू शकतो.',
      installHint:
        'योग्य उच्चारासाठी डिव्हाइसच्या सेटिंग्जमध्ये मराठी किंवा गुजराती आवाज इंस्टॉल करा.',
    },

    setup: {
      title: 'सेटअप पूर्ण झालेला नाही',
      description:
        'अॅपला Supabase प्रकल्प हवा आहे, किंवा त्याशिवाय चालण्यासाठी डेमो मोड. प्रकल्पाच्या मूळ फोल्डरमध्ये .env फाइल तयार करून खालीलपैकी एक पर्याय वापरा.',
      optionA: 'पर्याय A — Supabase शी जोडा',
      migrationsHint: (count) =>
        `त्यानंतर supabase/migrations/ मधील ${count} मायग्रेशन क्रमाने चालवा, नंतर supabase/seed.sql. संपूर्ण मार्गदर्शनासाठी README पहा.`,
      optionB: 'पर्याय B — डेमो मोडमध्ये ऑफलाइन चालवा',
      demoDescription:
        'संपूर्ण प्रणाली ब्राउझरमधील मॉकवर चालते — डेटाबेस, इंटरनेट किंवा क्रेडेन्शियल्सची गरज नाही. तिन्ही इंटरफेस चालतात. डेटा फक्त या ब्राउझरमध्ये राहतो.',
      restartHint:
        '.env तयार केल्यानंतर डेव्ह सर्व्हर पुन्हा सुरू करा — Vite पर्यावरण चल सुरुवातीला वाचते.',
    },

    demo: {
      label: 'डेमो मोड — डेटा फक्त या ब्राउझरमध्ये साठवला जातो',
      seed: (count) => `${toMarathiNumber(count)} रुग्ण जोडा`,
      reset: 'डेमो डेटा साफ करा',
    },

    errorBoundary: {
      title: 'काहीतरी तांत्रिक अडचण आली आहे.',
      description: 'कृपया पान पुन्हा लोड करा. अडचण कायम राहिल्यास रिसेप्शनशी संपर्क साधा.',
      reload: 'पान पुन्हा लोड करा',
    },

    tokenDetails: {
      doctor: 'डॉक्टर',
      department: 'विभाग',
      room: 'तपासणी कक्ष',
      date: 'दिनांक',
      hospital: 'रुग्णालय',
      waitPrefix: 'अंदाजे प्रतीक्षा वेळ:',
      waitDisclaimer: 'हा फक्त अंदाज आहे — प्रत्यक्ष वेळ थोडा कमी-जास्त होऊ शकतो.',
    },
  },
}
