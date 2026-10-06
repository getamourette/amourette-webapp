import type { Locale } from "@/lib/strings";
import { PRIVACY_EMAIL } from "@/lib/privacy";

// Publication copy derived from the eleven reviewed sections in #203.
// Launch reconciliation and verification belong in the PR and framework inventory.
export type PolicySection = {
  id: string;
  title: string;
  paragraphs: string[];
  items?: string[];
  entries?: { term: string; description: string }[];
  after?: string[];
};

type PrivacyPolicy = {
  updated: string;
  contents: string;
  back: string;
  sections: PolicySection[];
};

export const privacyPolicy: Record<Locale, PrivacyPolicy> = {
  en: {
    updated: "Last updated: 6 October 2026",
    contents: "On this page", back: "Back to Amourette",
    sections: [
      {
        id: "operator", title: "Who we are and how to contact us",
        paragraphs: [
          "Amourette is operated by InboxPilot, Inc., the organization responsible for the personal-data processing described in this policy.",
          "Contact address: 2810 N Church St PMB 16104, Wilmington, Delaware 19802-4447, USA.",
          `For questions about your personal data or to exercise your rights, email ${PRIVACY_EMAIL}.`,
          "This policy explains how we use personal data when you visit Amourette, create a profile, participate in a venue night or contact our team. It applies wherever Amourette is offered, including Europe and the United States. Amourette is intended for adults aged 18 and over.",
        ],
      },
      {
        id: "data", title: "What data we use and where it comes from",
        paragraphs: [
          "You provide your profile information, including your first name, photographs, optional biography, gender, dating preferences and confirmation that you are at least 18. We also receive the messages and in-app reports you choose to send, and record how those reports are handled. We receive emails you address to the team, including questions and requests about your personal data. We collect your email address if you subscribe to future-night announcements or email us.",
          "Using the service generates account and session identifiers, records of joining and leaving a venue night, activity timestamps, likes, mutual matches and conversation activity. Participation records indicate the venue you attended. Other participants may supply information about you through a report or a message.",
          "Technical services also process information needed to deliver and protect the app, such as request paths, IP addresses, browser information and error records. Your browser stores session information, settings and draft data as explained below.",
          "Your profile and an adult confirmation are required to enter the participant experience. Matching requires your agreement to the covered use of gender and dating preferences. A biography and subscription to announcements are optional.",
        ],
      },
      {
        id: "purposes", title: "Why we use your data",
        paragraphs: ["We use your data to:"],
        items: [
          "Maintain your profile and session and show who is participating in a venue night.",
          "Suggest mutually compatible participants, process discreet likes and open a conversation when two participants like each other.",
          "Deliver messages between matched participants during the venue night.",
          "Review photos manually, handle reports and blocks, and protect participants.",
          "Evaluate and improve venue nights through statistics on entry into the app, participation, likes, matches and conversations started.",
          "Send future-night announcements when you choose to subscribe.",
          "Respond to requests, maintain the service and meet applicable legal obligations.",
        ],
        after: [
          "These statistics help us identify entry difficulties, understand whether matches are spread across participants and measure whether matches lead to an exchange. They do not establish whether participants actually spoke in person. After the night, the retained report contains grouped statistics without participant names or account identifiers, message content or individual interaction histories.",
          "Legal grounds where the GDPR applies: use of gender and dating preferences for matching is subject to your explicit consent. Future-night marketing emails use a separate consent. We process the data necessary to manage your account and session and enable your participation in venue nights to perform our service contract with you.",
          "We use the data necessary to handle reports and protect participants and the service on the basis of our legitimate interests in preventing abuse and maintaining a safe service, while respecting the rights of those involved. We use the information necessary to handle your data-rights requests and comply with our legal obligations under data-protection law.",
          "We measure QR scans, profile completions and room entries to understand how the entry flow works and improve it, on the basis of our legitimate interest in evaluating and improving the service, using only the data necessary for that purpose. Other purposes require their own legal grounds.",
        ],
      },
      {
        id: "matching", title: "Your matching preferences and choices",
        paragraphs: [
          "We use your gender and the genders you want to meet to suggest compatible people at the same venue night and show your profile to them. These choices can reveal information about your sexual orientation.",
          "You can withdraw your matching consent from your profile at any time. Withdrawal immediately removes your profile from discovery and stops new likes and matches. We stop the covered use of your preferences and initiate their deletion.",
          "Your existing conversations remain available until the definitive end of the venue night, subject to the usual presence, blocking and moderation rules. They are then deleted. Withdrawing this consent is different from deleting your account.",
          "Withdrawal does not change the lawfulness of processing carried out before it. It does not subscribe or unsubscribe you from future-night emails.",
        ],
      },
      {
        id: "recipients", title: "Who can receive your data",
        paragraphs: [
          "Other eligible participants see the profile information presented by the app, such as your first name, photo and biography, within the venue experience. Likes are discreet: a conversation opens only when interest is mutual. Messages are made available to the matched participants.",
          "Authorized team members handle service operation, photo moderation, reports and privacy requests, with access to the data needed for these tasks.",
          "We use service providers for these functions:",
        ],
        entries: [
          { term: "Supabase", description: "Database, account sessions, photo storage and real-time communication." },
          { term: "Vercel", description: "Website and server-side application hosting." },
          { term: "Resend", description: "Delivery of application emails and configured outgoing team replies." },
          { term: "Cloudflare", description: "Domain/DNS services and routing emails sent to our contact addresses." },
          { term: "Founder mailbox providers", description: "Receipt and handling of forwarded contact emails; current routing uses Gmail." },
        ],
      },
      {
        id: "hosting", title: "Hosting and international access",
        paragraphs: [
          "Our production database and photo storage are hosted in the European Union.",
          "Our operator is based in the United States. Our team and service providers may process or access data outside your country of residence, including outside the European Economic Area. EU hosting does not mean all processing stays in the EU.",
          `For information about international processing and applicable transfer safeguards, contact ${PRIVACY_EMAIL}.`,
        ],
      },
      {
        id: "retention", title: "How long we keep data",
        paragraphs: ["We keep your data for the periods described below."],
        entries: [
          { term: "Profile and preferences", description: "Your profile and current photos are kept between nights, then deleted after two years without voluntary app use, or earlier on a valid deletion request. Withdrawing matching consent initiates earlier deletion of your gender and dating preferences." },
          { term: "Night interactions", description: "Likes, matches and conversations are deleted at the definitive end of the night, not during a temporary pause. Arrival, departure and participation records are separate and are not automatically erased at night end." },
          { term: "Replaced or rejected photos", description: "Unused replaced or refused files are removed once more than 24 hours have passed since upload. A rejected displayed photo is hidden immediately and becomes eligible for deletion after an approved replacement or 30 days without correction, subject to that upload-age rule." },
          { term: "Safety and privacy requests", description: "Reports, resolved photo-moderation cases and privacy requests are kept during handling and for 12 months after closure or resolution. Unnecessary supporting documents are removed sooner. Blocks remain while both profiles exist." },
          { term: "Consent evidence", description: "Minimal evidence of matching consent is kept while relied on, then for 12 months after withdrawal or account deletion, whichever happens first. Giving consent again does not extend older evidence’s retention." },
          { term: "Emails", description: "Subscriptions last three years from subscription or the last explicit confirmation. Unsubscribe stops announcements immediately; a minimal do-not-send record is kept for three years after unsubscribe. Ordinary activity does not renew these periods or resubscribe you. Delivery records are kept for 30 days after successful sending or definitive abandonment." },
          { term: "Device storage and backups", description: "Unfinished profile drafts expire 24 hours after your last deliberate edit and are cleared when the app next runs, or earlier on successful profile creation. Technical logs and backups have separate retention periods; deletion from the active app does not immediately erase every backup or copies downloaded by another participant." },
        ],
        after: [
          "Necessary case or consent evidence may be kept longer for an ongoing dispute. Reports may also be retained for a specific continuing need that is documented and reviewed, such as an active sanction. Deleted photos are not retained as moderation history.",
          "After a night, we retain grouped statistics without participant names, account identifiers, message content or individual interaction histories.",
        ],
      },
      {
        id: "storage", title: "Browser storage",
        paragraphs: [
          "The app uses browser storage for the session, interface preferences, profile drafts and functions such as conversation read state. This can keep some information on your device between visits. Clearing browser data can remove local drafts and interrupt access to your existing session.",
          "You can resume an unfinished profile draft for 24 hours after your last deliberate edit. This covers the first name, biography, photo and form progress saved on your device; gender and dating preferences are not saved in the persistent draft. Drafts are cleared when your profile is successfully created.",
          "An expired draft is no longer restored and is cleared when the app next runs its cleanup, including when you reopen it. The app cannot clear device storage while it is closed. Simply reopening or reloading does not extend the draft’s lifetime.",
        ],
      },
      {
        id: "rights", title: "Your rights",
        paragraphs: [
          "Your rights depend on the law applicable to you and the processing involved. You can contact us to request access to your data, correction or deletion, or to ask about other rights available to you.",
          "European Economic Area: where the GDPR applies, you may also request restriction of processing, object to processing based on legitimate interests and request portability when its conditions apply. You can withdraw consent without affecting the lawfulness of earlier processing. We respond without undue delay and normally within one month; if a permitted extension is necessary, we explain why within that month. The extension can be up to two additional months.",
          "United States: depending on your state of residence and whether its privacy laws apply to our processing, you may have rights to access, correct, delete or obtain a copy of your personal data, as well as other protections under those laws. We handle requests within the applicable legal deadlines and explain any permitted extension or limits.",
          `For requests and questions about the rights applicable to you, contact ${PRIVACY_EMAIL}.`,
          "We may ask for proportionate information if we have reasonable doubts about your identity. We do not require identity documents systematically. We protect other people’s rights when responding and explain any applicable limits to a request.",
          "You can stop future-night announcements using the unsubscribe link in our emails. This does not itself delete your profile. Matching consent can be withdrawn from your profile as described above.",
          "You may lodge a complaint with the competent privacy or data protection authority under applicable law. You do not need to contact us first.",
        ],
      },
      {
        id: "security", title: "Security",
        paragraphs: ["We use access controls, authenticated sessions, restricted photo storage and encrypted network connections to protect personal data. We investigate incidents and take appropriate measures to contain their effects. When required, we notify the competent authority and affected people."],
      },
      {
        id: "changes", title: "Changes to this policy",
        paragraphs: ["We will date updates to this policy and inform you of material changes through an appropriate channel. Where a change requires consent, we will ask for it separately. Continued use alone does not constitute consent to a new purpose."],
      },
    ],
  },
  fr: {
    updated: "Dernière mise à jour : 6 octobre 2026",
    contents: "Sur cette page", back: "Retour à Amourette",
    sections: [
      {
        id: "operator", title: "Qui sommes-nous et comment nous contacter ?",
        paragraphs: [
          "Amourette est exploité par InboxPilot, Inc., l’organisation responsable des traitements de données personnelles décrits dans cette politique.",
          "Adresse de contact : 2810 N Church St PMB 16104, Wilmington, Delaware 19802-4447, États-Unis.",
          `Pour toute question sur vos données personnelles ou pour exercer vos droits, écrivez à ${PRIVACY_EMAIL}.`,
          "Cette politique explique comment nous utilisons vos données lorsque vous visitez Amourette, créez un profil, participez à une soirée dans un établissement ou contactez notre équipe. Elle s’applique partout où Amourette est proposé, notamment en Europe et aux États-Unis. Amourette s’adresse aux personnes majeures de 18 ans et plus.",
        ],
      },
      {
        id: "data", title: "Quelles données utilisons-nous et d’où viennent-elles ?",
        paragraphs: [
          "Vous fournissez les informations de votre profil : prénom, photos, biographie facultative, genre, préférences de rencontre et confirmation que vous avez au moins 18 ans. Nous recevons également les messages et les signalements que vous choisissez d’envoyer dans l’application, et conservons les informations sur le traitement de ces signalements. Nous recevons les emails que vous adressez à l’équipe, notamment vos questions et demandes concernant vos données. Nous recueillons votre adresse email si vous vous inscrivez aux annonces des prochaines soirées ou si vous nous écrivez.",
          "L’utilisation du service génère des identifiants de compte et de session, des enregistrements d’arrivée et de départ d’une soirée, des dates d’activité, des likes, des matchs réciproques et de l’activité de conversation. Les enregistrements de participation indiquent l’établissement fréquenté. D’autres participants peuvent fournir des informations vous concernant dans un signalement ou un message.",
          "Les services techniques traitent aussi les informations nécessaires au fonctionnement et à la protection de l’application, comme les chemins des requêtes, les adresses IP, les informations du navigateur et les erreurs. Votre navigateur conserve des informations de session, des réglages et des brouillons, comme expliqué plus bas.",
          "Un profil et une confirmation de majorité sont nécessaires pour accéder à l’expérience des participants. Le matching nécessite votre accord pour l’utilisation décrite de votre genre et de vos préférences de rencontre. La biographie et l’inscription aux annonces sont facultatives.",
        ],
      },
      {
        id: "purposes", title: "Pourquoi utilisons-nous vos données ?",
        paragraphs: ["Nous utilisons vos données pour :"],
        items: [
          "Gérer votre profil et votre session et montrer qui participe à une soirée.",
          "Proposer des participants mutuellement compatibles, traiter les likes discrètement et ouvrir une conversation lorsque deux personnes se likent réciproquement.",
          "Transmettre les messages entre participants ayant matché pendant la soirée.",
          "Vérifier les photos manuellement, traiter les signalements et les blocages et protéger les participants.",
          "Évaluer et améliorer les soirées grâce à des statistiques sur l’entrée dans l’application, la participation, les likes, les matchs et les conversations commencées.",
          "Envoyer les annonces des prochaines soirées si vous choisissez de vous y inscrire.",
          "Répondre aux demandes, assurer le fonctionnement du service et respecter les obligations légales applicables.",
        ],
        after: [
          "Ces statistiques nous aident à repérer les difficultés d’entrée, à comprendre si les matchs se répartissent entre les participants et à mesurer s’ils débouchent sur un échange. Elles ne permettent pas de savoir si les participants se sont réellement parlé en personne. Après la soirée, le rapport conservé contient des statistiques regroupées, sans noms ni identifiants de compte, sans contenu des messages ni historique individuel des interactions.",
          "Bases légales lorsque le RGPD s’applique : l’utilisation de votre genre et de vos préférences pour le matching repose sur votre consentement explicite. Les emails d’annonce des prochaines soirées font l’objet d’un consentement distinct. Nous traitons les données nécessaires à la gestion de votre compte et de votre session et à votre participation aux soirées pour exécuter notre contrat de service avec vous.",
          "Nous utilisons les données nécessaires au traitement des signalements et à la protection des participants et du service sur la base de nos intérêts légitimes à prévenir les abus et à maintenir un service sûr, dans le respect des droits des personnes concernées. Nous utilisons les informations nécessaires pour traiter vos demandes relatives à vos données et respecter nos obligations légales en matière de protection des données.",
          "Nous mesurons les scans de QR, les profils complétés et les entrées dans la salle pour comprendre et améliorer le parcours d’entrée, sur la base de notre intérêt légitime à évaluer et améliorer le service, avec les seules données nécessaires à cette fin. Les autres finalités nécessitent leurs propres bases légales.",
        ],
      },
      {
        id: "matching", title: "Vos préférences de rencontre et vos choix",
        paragraphs: [
          "Nous utilisons votre genre et les genres des personnes que vous souhaitez rencontrer pour vous proposer des personnes compatibles à la même soirée et leur montrer votre profil. Ces choix peuvent révéler des informations sur votre orientation sexuelle.",
          "Vous pouvez retirer votre consentement au matching à tout moment depuis votre profil. Ce retrait enlève immédiatement votre profil de la découverte et arrête les nouveaux likes et matchs. Nous cessons l’utilisation concernée de vos préférences et lançons leur suppression.",
          "Vos conversations existantes restent accessibles jusqu’à la fin définitive de la soirée, sous réserve des règles habituelles de présence, de blocage et de modération. Elles sont ensuite supprimées. Retirer ce consentement est différent de supprimer votre compte.",
          "Le retrait ne remet pas en cause la licéité des traitements effectués auparavant. Il ne vous inscrit ni ne vous désinscrit des emails des prochaines soirées.",
        ],
      },
      {
        id: "recipients", title: "Qui peut recevoir vos données ?",
        paragraphs: [
          "Les autres participants éligibles voient les informations de profil présentées par l’application, comme votre prénom, votre photo et votre biographie, dans le cadre de la soirée. Les likes restent discrets : une conversation ne s’ouvre que si l’intérêt est réciproque. Les messages sont accessibles aux participants du match.",
          "Les membres autorisés de l’équipe assurent le fonctionnement du service, la modération des photos, le traitement des signalements et des demandes relatives aux données, avec accès aux données nécessaires à ces tâches.",
          "Nous faisons appel à des prestataires pour les fonctions suivantes :",
        ],
        entries: [
          { term: "Supabase", description: "Base de données, sessions de compte, stockage des photos et communication en temps réel." },
          { term: "Vercel", description: "Hébergement du site et de l’application côté serveur." },
          { term: "Resend", description: "Envoi des emails de l’application et des réponses sortantes de l’équipe configurées à cet effet." },
          { term: "Cloudflare", description: "Services de domaine/DNS et acheminement des emails envoyés à nos adresses de contact." },
          { term: "Fournisseurs des messageries des fondateurs", description: "Réception et traitement des emails de contact transférés ; l’acheminement actuel utilise Gmail." },
        ],
      },
      {
        id: "hosting", title: "Hébergement et accès internationaux",
        paragraphs: [
          "Notre base de données et notre stockage des photos de production sont hébergés dans l’Union européenne.",
          "Notre opérateur est établi aux États-Unis. Notre équipe et nos prestataires peuvent traiter vos données ou y accéder en dehors de votre pays de résidence, y compris hors de l’Espace économique européen. Un hébergement dans l’UE ne signifie pas que tous les traitements restent dans l’UE.",
          `Pour obtenir des informations sur les traitements internationaux et les garanties de transfert applicables, contactez ${PRIVACY_EMAIL}.`,
        ],
      },
      {
        id: "retention", title: "Combien de temps conservons-nous les données ?",
        paragraphs: ["Nous conservons vos données pendant les durées décrites ci-dessous."],
        entries: [
          { term: "Profil et préférences", description: "Votre profil et vos photos actuelles sont conservés entre les soirées, puis supprimés après deux ans sans utilisation volontaire de l’application, ou plus tôt sur demande de suppression valide. Le retrait du consentement au matching déclenche plus tôt la suppression de votre genre et de vos préférences." },
          { term: "Interactions de soirée", description: "Les likes, matchs et conversations sont supprimés à la fin définitive de la soirée, pas lors d’une pause temporaire. Les enregistrements d’arrivée, de départ et de participation sont distincts et ne sont pas automatiquement effacés en fin de soirée." },
          { term: "Photos remplacées ou refusées", description: "Les fichiers remplacés ou refusés qui ne sont plus utilisés sont supprimés lorsque leur envoi remonte à plus de 24 heures. Une photo affichée rejetée est masquée immédiatement et peut être supprimée après l’approbation d’un remplacement ou 30 jours sans correction, sous réserve de cette ancienneté depuis l’envoi." },
          { term: "Sécurité et demandes relatives aux données", description: "Les signalements, dossiers de modération des photos et demandes relatives aux données sont conservés pendant leur traitement, puis 12 mois après leur clôture ou résolution. Les justificatifs devenus inutiles sont supprimés plus tôt. Les blocages restent tant que les deux profils existent." },
          { term: "Preuves du consentement", description: "Les preuves minimales du consentement au matching sont conservées tant que nous nous appuyons dessus, puis 12 mois après son retrait ou la suppression du compte, selon le premier événement. Un nouvel accord ne prolonge pas la conservation des anciennes preuves." },
          { term: "Emails", description: "Les inscriptions durent trois ans à partir de l’inscription ou de sa dernière confirmation explicite. La désinscription arrête immédiatement les annonces ; une trace minimale de non-envoi est conservée trois ans après la désinscription. L’activité ordinaire ne renouvelle pas ces délais et ne vous réinscrit pas. Les données de livraison sont conservées 30 jours après l’envoi réussi ou l’abandon définitif." },
          { term: "Stockage sur votre appareil et sauvegardes", description: "Les brouillons de profil expirent 24 heures après votre dernière modification volontaire et sont effacés à la prochaine exécution de l’application, ou plus tôt si le profil est créé. Les journaux techniques et sauvegardes ont des durées distinctes ; supprimer les données de l’application active n’efface pas immédiatement toutes les sauvegardes ni les copies téléchargées par un autre participant." },
        ],
        after: [
          "Les preuves nécessaires relatives à un dossier ou au consentement peuvent être conservées plus longtemps en cas de litige en cours. Les signalements peuvent aussi être conservés pour un besoin précis, documenté et réexaminé, comme une sanction active. L’historique de modération ne conserve pas les photos supprimées.",
          "Après une soirée, nous conservons des statistiques regroupées sans noms, identifiants de compte, contenu des messages ni historique individuel des interactions.",
        ],
      },
      {
        id: "storage", title: "Stockage dans votre navigateur",
        paragraphs: [
          "L’application utilise le stockage du navigateur pour la session, les préférences d’interface, les brouillons de profil et des fonctions comme l’état de lecture des conversations. Certaines informations peuvent ainsi rester sur votre appareil entre les visites. Effacer les données du navigateur peut supprimer les brouillons locaux et interrompre l’accès à votre session existante.",
          "Vous pouvez reprendre un brouillon de profil pendant 24 heures après votre dernière modification volontaire. Cela concerne le prénom, la biographie, la photo et l’avancement du formulaire enregistrés sur votre appareil ; le genre et les préférences de rencontre ne sont pas enregistrés dans le brouillon persistant. Les brouillons sont effacés une fois votre profil créé avec succès.",
          "Un brouillon expiré n’est plus restauré et est effacé lors du prochain nettoyage exécuté par l’application, notamment à sa réouverture. L’application ne peut pas effacer le stockage de votre appareil lorsqu’elle est fermée. Rouvrir ou recharger ne prolonge pas la durée du brouillon.",
        ],
      },
      {
        id: "rights", title: "Vos droits",
        paragraphs: [
          "Vos droits dépendent de la loi qui vous est applicable et du traitement concerné. Vous pouvez nous contacter pour demander l’accès à vos données, leur rectification ou leur suppression, ou pour connaître vos autres droits.",
          "Espace économique européen : lorsque le RGPD s’applique, vous pouvez aussi demander la limitation du traitement, vous opposer aux traitements fondés sur l’intérêt légitime et demander la portabilité lorsque ses conditions sont réunies. Vous pouvez retirer votre consentement sans remettre en cause la licéité des traitements antérieurs. Nous répondons sans retard injustifié et normalement sous un mois ; si une prolongation autorisée est nécessaire, nous vous en expliquons la raison dans ce premier mois. Elle peut aller jusqu’à deux mois supplémentaires.",
          "États-Unis : selon votre État de résidence et l’application de ses lois sur la vie privée à nos traitements, vous pouvez disposer de droits d’accès, de rectification, de suppression ou d’obtention d’une copie de vos données, ainsi que d’autres protections prévues par ces lois. Nous traitons les demandes dans les délais légaux applicables et expliquons les prolongations ou limites autorisées.",
          `Pour vos demandes et questions sur les droits qui vous sont applicables, contactez ${PRIVACY_EMAIL}.`,
          "Nous pouvons demander des informations proportionnées en cas de doute raisonnable sur votre identité. Nous ne demandons pas systématiquement de pièce d’identité. Nous protégeons les droits des autres personnes dans nos réponses et expliquons les limites éventuellement applicables à une demande.",
          "Vous pouvez arrêter les annonces des prochaines soirées grâce au lien de désinscription dans nos emails. Cela ne supprime pas votre profil. Vous pouvez retirer le consentement au matching depuis votre profil, comme expliqué plus haut.",
          "Vous pouvez saisir l’autorité compétente en matière de vie privée ou de protection des données, conformément à la loi applicable. Vous n’avez pas besoin de nous contacter au préalable.",
        ],
      },
      {
        id: "security", title: "Sécurité",
        paragraphs: ["Nous utilisons des contrôles d’accès, des sessions authentifiées, un stockage restreint des photos et des connexions réseau chiffrées pour protéger les données personnelles. Nous examinons les incidents et prenons les mesures adaptées pour en limiter les effets. Lorsque cela est requis, nous informons l’autorité compétente et les personnes concernées."],
      },
      {
        id: "changes", title: "Modifications de cette politique",
        paragraphs: ["Nous daterons les mises à jour de cette politique et vous informerons des changements importants par un canal approprié. Lorsqu’un changement nécessite votre consentement, nous le demanderons séparément. Continuer à utiliser le service ne constitue pas, à lui seul, un consentement à une nouvelle finalité."],
      },
    ],
  },
  es: {
    updated: "Última actualización: 6 de octubre de 2026",
    contents: "En esta página", back: "Volver a Amourette",
    sections: [
      {
        id: "operator", title: "Quiénes somos y cómo contactarnos",
        paragraphs: [
          "Amourette está operado por InboxPilot, Inc., la organización responsable del tratamiento de datos personales descrito en esta política.",
          "Dirección de contacto: 2810 N Church St PMB 16104, Wilmington, Delaware 19802-4447, Estados Unidos.",
          `Para consultas sobre tus datos personales o para ejercer tus derechos, escribe a ${PRIVACY_EMAIL}.`,
          "Esta política explica cómo usamos tus datos cuando visitas Amourette, creas un perfil, participas en una noche en un local o contactas con nuestro equipo. Se aplica donde se ofrezca Amourette, incluidos Europa y Estados Unidos. Amourette está destinado a personas adultas de 18 años o más.",
        ],
      },
      {
        id: "data", title: "Qué datos usamos y de dónde proceden",
        paragraphs: [
          "Tú proporcionas la información de tu perfil: nombre, fotografías, biografía opcional, género, preferencias de citas y confirmación de que tienes al menos 18 años. También recibimos los mensajes y las denuncias que decides enviar en la aplicación y registramos cómo se gestionan esas denuncias. Recibimos los emails que diriges al equipo, incluidas consultas y solicitudes sobre tus datos. Recogemos tu dirección de email si te suscribes a los anuncios de próximas noches o nos escribes.",
          "El uso del servicio genera identificadores de cuenta y sesión, registros de entrada y salida de una noche, fechas de actividad, likes, matches mutuos y actividad de conversación. Los registros de participación indican el local al que asististe. Otros participantes pueden aportar información sobre ti mediante una denuncia o un mensaje.",
          "Los servicios técnicos también tratan información necesaria para ofrecer y proteger la aplicación, como rutas de solicitudes, direcciones IP, información del navegador y registros de errores. Tu navegador guarda información de sesión, ajustes y borradores, como se explica más adelante.",
          "Se requieren un perfil y una confirmación de mayoría de edad para acceder a la experiencia de participantes. El matching requiere tu acuerdo para el uso descrito de tu género y tus preferencias de citas. La biografía y la suscripción a los anuncios son opcionales.",
        ],
      },
      {
        id: "purposes", title: "Para qué usamos tus datos",
        paragraphs: ["Usamos tus datos para:"],
        items: [
          "Gestionar tu perfil y sesión y mostrar quién participa en una noche.",
          "Sugerir participantes mutuamente compatibles, procesar likes discretos y abrir una conversación cuando dos personas se dan like mutuamente.",
          "Entregar mensajes entre participantes que han hecho match durante la noche.",
          "Revisar fotos manualmente, gestionar denuncias y bloqueos y proteger a los participantes.",
          "Evaluar y mejorar las noches mediante estadísticas sobre la entrada en la aplicación, la participación, los likes, los matches y las conversaciones iniciadas.",
          "Enviar anuncios de próximas noches cuando eliges suscribirte.",
          "Responder a solicitudes, mantener el servicio y cumplir las obligaciones legales aplicables.",
        ],
        after: [
          "Estas estadísticas nos ayudan a identificar dificultades de entrada, entender si los matches se reparten entre participantes y medir si llevan a un intercambio. No permiten saber si los participantes hablaron en persona. Después de la noche, el informe conservado contiene estadísticas agrupadas sin nombres ni identificadores de cuenta, contenido de mensajes ni historiales individuales de interacciones.",
          "Bases legales cuando se aplica el RGPD: el uso de tu género y preferencias para el matching requiere tu consentimiento explícito. Los emails de anuncios de próximas noches usan un consentimiento separado. Tratamos los datos necesarios para gestionar tu cuenta y sesión y permitir tu participación en las noches para ejecutar nuestro contrato de servicio contigo.",
          "Usamos los datos necesarios para gestionar denuncias y proteger a los participantes y al servicio sobre la base de nuestros intereses legítimos en prevenir abusos y mantener un servicio seguro, respetando los derechos de las personas afectadas. Usamos la información necesaria para atender tus solicitudes relativas a tus datos y cumplir nuestras obligaciones legales de protección de datos.",
          "Medimos los escaneos de QR, los perfiles completados y las entradas a la sala para entender y mejorar el recorrido de entrada, sobre la base de nuestro interés legítimo en evaluar y mejorar el servicio, usando solo los datos necesarios para ese fin. Otras finalidades requieren sus propias bases legales.",
        ],
      },
      {
        id: "matching", title: "Tus preferencias de citas y tus decisiones",
        paragraphs: [
          "Usamos tu género y los géneros de las personas que quieres conocer para sugerirte personas compatibles en la misma noche y mostrarles tu perfil. Estas decisiones pueden revelar información sobre tu orientación sexual.",
          "Puedes retirar tu consentimiento al matching en cualquier momento desde tu perfil. La retirada elimina inmediatamente tu perfil de los descubrimientos y detiene los nuevos likes y matches. Dejamos de realizar el uso cubierto de tus preferencias e iniciamos su eliminación.",
          "Tus conversaciones existentes siguen disponibles hasta el final definitivo de la noche, sujetas a las reglas habituales de presencia, bloqueo y moderación. Después se eliminan. Retirar este consentimiento es diferente de eliminar tu cuenta.",
          "La retirada no afecta a la licitud de los tratamientos realizados anteriormente. No te suscribe ni te da de baja de los emails de próximas noches.",
        ],
      },
      {
        id: "recipients", title: "Quién puede recibir tus datos",
        paragraphs: [
          "Los demás participantes elegibles ven la información de perfil que presenta la aplicación, como tu nombre, foto y biografía, dentro de la experiencia del local. Los likes son discretos: una conversación solo se abre cuando el interés es mutuo. Los mensajes están disponibles para los participantes del match.",
          "Los miembros autorizados del equipo gestionan el funcionamiento del servicio, la moderación de fotos, las denuncias y las solicitudes de privacidad, con acceso a los datos necesarios para esas tareas.",
          "Usamos proveedores para las siguientes funciones:",
        ],
        entries: [
          { term: "Supabase", description: "Base de datos, sesiones de cuenta, almacenamiento de fotos y comunicación en tiempo real." },
          { term: "Vercel", description: "Alojamiento del sitio y de la aplicación del lado del servidor." },
          { term: "Resend", description: "Envío de emails de la aplicación y de las respuestas salientes del equipo configuradas para ello." },
          { term: "Cloudflare", description: "Servicios de dominio/DNS y enrutamiento de emails enviados a nuestras direcciones de contacto." },
          { term: "Proveedores de correo de los fundadores", description: "Recepción y gestión de los emails de contacto reenviados; el enrutamiento actual utiliza Gmail." },
        ],
      },
      {
        id: "hosting", title: "Alojamiento y acceso internacional",
        paragraphs: [
          "Nuestra base de datos y nuestro almacenamiento de fotos de producción están alojados en la Unión Europea.",
          "Nuestro operador está establecido en Estados Unidos. Nuestro equipo y proveedores pueden tratar tus datos o acceder a ellos fuera de tu país de residencia, incluso fuera del Espacio Económico Europeo. El alojamiento en la UE no significa que todo el tratamiento permanezca en la UE.",
          `Para obtener información sobre el tratamiento internacional y las garantías de transferencia aplicables, contacta con ${PRIVACY_EMAIL}.`,
        ],
      },
      {
        id: "retention", title: "Cuánto tiempo conservamos los datos",
        paragraphs: ["Conservamos tus datos durante los plazos descritos a continuación."],
        entries: [
          { term: "Perfil y preferencias", description: "Tu perfil y fotos actuales se conservan entre noches y se eliminan tras dos años sin uso voluntario de la aplicación, o antes tras una solicitud válida de eliminación. Retirar el consentimiento al matching inicia antes la eliminación de tu género y preferencias." },
          { term: "Interacciones de la noche", description: "Los likes, matches y conversaciones se eliminan al final definitivo de la noche, no durante una pausa temporal. Los registros de llegada, salida y participación son distintos y no se borran automáticamente al terminar la noche." },
          { term: "Fotos sustituidas o rechazadas", description: "Los archivos sustituidos o rechazados que ya no se usan se eliminan cuando han pasado más de 24 horas desde su subida. Una foto mostrada que se rechaza se oculta inmediatamente y puede eliminarse tras aprobarse una sustitución o después de 30 días sin corrección, sujeta a esa antigüedad desde la subida." },
          { term: "Seguridad y solicitudes sobre datos", description: "Las denuncias, los casos de moderación de fotos y las solicitudes sobre datos se conservan durante su gestión y durante 12 meses después del cierre o resolución. Los justificantes innecesarios se eliminan antes. Los bloqueos se mantienen mientras existan ambos perfiles." },
          { term: "Pruebas del consentimiento", description: "Las pruebas mínimas del consentimiento al matching se conservan mientras nos basamos en él y durante 12 meses después de su retirada o de la eliminación de la cuenta, lo que ocurra primero. Un nuevo acuerdo no prolonga la conservación de pruebas anteriores." },
          { term: "Emails", description: "Las suscripciones duran tres años desde la suscripción o su última confirmación explícita. La baja detiene los anuncios inmediatamente; se conserva un registro mínimo de no envío durante tres años desde la baja. La actividad ordinaria no renueva estos plazos ni vuelve a suscribirte. Los registros de entrega se conservan 30 días tras el envío correcto o el abandono definitivo." },
          { term: "Almacenamiento en tu dispositivo y copias de seguridad", description: "Los borradores de perfil caducan 24 horas después de tu última edición voluntaria y se borran cuando la aplicación vuelve a ejecutarse, o antes si se crea el perfil. Los registros técnicos y copias de seguridad tienen plazos distintos; borrar los datos de la aplicación activa no elimina inmediatamente todas las copias de seguridad ni las copias descargadas por otro participante." },
        ],
        after: [
          "Las pruebas necesarias relativas a un caso o al consentimiento pueden conservarse más tiempo si hay un litigio en curso. Las denuncias también pueden conservarse por una necesidad concreta, documentada y revisada, como una sanción activa. El historial de moderación no conserva las fotos eliminadas.",
          "Después de una noche, conservamos estadísticas agrupadas sin nombres, identificadores de cuenta, contenido de mensajes ni historiales individuales de interacciones.",
        ],
      },
      {
        id: "storage", title: "Almacenamiento en tu navegador",
        paragraphs: [
          "La aplicación usa el almacenamiento del navegador para la sesión, las preferencias de interfaz, los borradores de perfil y funciones como el estado de lectura de conversaciones. Esto puede mantener información en tu dispositivo entre visitas. Borrar los datos del navegador puede eliminar borradores locales e interrumpir el acceso a tu sesión existente.",
          "Puedes retomar un borrador de perfil durante 24 horas después de tu última edición voluntaria. Esto incluye el nombre, la biografía, la foto y el progreso del formulario guardados en tu dispositivo; el género y las preferencias de citas no se guardan en el borrador persistente. Los borradores se borran cuando tu perfil se crea correctamente.",
          "Un borrador caducado no se restaura y se borra cuando la aplicación vuelve a ejecutar su limpieza, incluida su reapertura. La aplicación no puede borrar el almacenamiento del dispositivo mientras está cerrada. Reabrir o recargar no prolonga la duración del borrador.",
        ],
      },
      {
        id: "rights", title: "Tus derechos",
        paragraphs: [
          "Tus derechos dependen de la legislación que te sea aplicable y del tratamiento en cuestión. Puedes contactarnos para solicitar acceso a tus datos, su rectificación o eliminación, o para consultar otros derechos disponibles.",
          "Espacio Económico Europeo: cuando se aplica el RGPD, también puedes solicitar la limitación del tratamiento, oponerte a tratamientos basados en intereses legítimos y solicitar la portabilidad cuando se cumplan sus condiciones. Puedes retirar el consentimiento sin afectar a la licitud de tratamientos anteriores. Respondemos sin demora injustificada y normalmente en un mes; si es necesaria una prórroga permitida, explicamos el motivo dentro de ese primer mes. La prórroga puede ser de hasta dos meses adicionales.",
          "Estados Unidos: según tu estado de residencia y si sus leyes de privacidad se aplican a nuestro tratamiento, puedes tener derechos de acceso, rectificación, eliminación u obtención de una copia de tus datos, además de otras protecciones previstas en esas leyes. Tramitamos las solicitudes dentro de los plazos legales aplicables y explicamos las prórrogas o limitaciones permitidas.",
          `Para solicitudes y consultas sobre los derechos que te sean aplicables, contacta con ${PRIVACY_EMAIL}.`,
          "Podemos solicitar información proporcionada si tenemos dudas razonables sobre tu identidad. No pedimos documentos de identidad sistemáticamente. Protegemos los derechos de otras personas al responder y explicamos los límites aplicables a una solicitud.",
          "Puedes detener los anuncios de próximas noches mediante el enlace de baja de nuestros emails. Esto no elimina tu perfil. Puedes retirar el consentimiento al matching desde tu perfil, como se explica anteriormente.",
          "Puedes presentar una reclamación ante la autoridad competente en materia de privacidad o protección de datos, conforme a la legislación aplicable. No necesitas contactarnos antes de hacerlo.",
        ],
      },
      {
        id: "security", title: "Seguridad",
        paragraphs: ["Usamos controles de acceso, sesiones autenticadas, almacenamiento restringido de fotos y conexiones de red cifradas para proteger los datos personales. Investigamos los incidentes y tomamos medidas adecuadas para contener sus efectos. Cuando corresponde, notificamos a la autoridad competente y a las personas afectadas."],
      },
      {
        id: "changes", title: "Cambios en esta política",
        paragraphs: ["Fecharemos las actualizaciones de esta política e informaremos de los cambios importantes por un canal adecuado. Cuando un cambio requiera consentimiento, lo solicitaremos por separado. Seguir usando el servicio no constituye por sí solo consentimiento para una nueva finalidad."],
      },
    ],
  },
};
