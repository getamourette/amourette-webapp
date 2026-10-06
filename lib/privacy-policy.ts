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
  authority: string;
  sections: PolicySection[];
};

export const privacyPolicy: Record<Locale, PrivacyPolicy> = {
  en: {
    updated: "Last updated: 6 October 2026",
    contents: "On this page", back: "Back to Amourette", authority: "Contact the CNIL in France",
    sections: [
      {
        id: "operator", title: "Who we are and how to contact us",
        paragraphs: [
          "Amourette is operated by InboxPilot, Inc., the organization responsible for the personal-data processing described in this policy.",
          "Contact address: 2810 N Church St PMB 16104, Wilmington, Delaware 19802-4447, USA.",
          `For questions about your personal data or to exercise your rights, email ${PRIVACY_EMAIL}.`,
          "This policy explains how we use personal data when you visit Amourette, create a profile, participate in a venue night or contact our team. Amourette is intended for adults aged 18 and over.",
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
          "Legal grounds: use of gender and dating preferences for matching is subject to your explicit consent. Future-night marketing emails use a separate consent. We process the data necessary to manage your account and session and enable your participation in venue nights to perform our service contract with you.",
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
          "Our operator is based in the United States, and members of the team or service providers may process or access data outside the European Economic Area. EU database hosting does not mean all processing stays in the EU.",
          `For information about international processing and applicable transfer safeguards, contact ${PRIVACY_EMAIL}.`,
        ],
      },
      {
        id: "retention", title: "How long we keep data",
        paragraphs: ["We keep your data for the periods described below."],
        entries: [
          { term: "Profile and current photos", description: "Between nights, then deletion after two years without voluntary app use, or earlier following a valid deletion request. Automatic session refresh does not renew the period." },
          { term: "Gender and dating preferences", description: "The profile period applies while consent remains active; withdrawal stops covered use and initiates deletion earlier." },
          { term: "Matching-consent evidence", description: "While we rely on the consent, then 12 months after withdrawal or account deletion, whichever occurs first. Keep only the account reference, grant/withdrawal dates and accepted wording version, without preferences, photos or messages. A new agreement does not extend older evidence’s expiry. Necessary evidence may be kept longer for an ongoing dispute, until resolution." },
          { term: "Unfinished onboarding draft on your device", description: "Available to resume for 24 hours from your last deliberate edit, then discarded and cleared when the app next runs its cleanup. Cleared earlier when the profile is successfully created. Simply reopening or reloading does not extend the period." },
          { term: "Night likes, matches and conversations", description: "Deleted at definitive venue-night end. Temporary pauses do not end the night." },
          { term: "Replaced photos and refused proposed replacements", description: "Removed by scheduled cleanup once no current or pending photo needs the file and it is more than 24 hours old from upload. This is not an extra 24 hours after replacement." },
          { term: "A displayed photo rejected by moderation", description: "Hidden from participant profile surfaces immediately. File protection ends upon an approved replacement or after 30 days without correction, subject to the ordinary upload-age threshold and scheduled cleanup." },
          { term: "Photo-moderation decisions", description: "While correction remains active, then 12 months after resolution; necessary evidence may be retained longer for an ongoing dispute. Deleted images are not kept through this decision-history rule." },
          { term: "Blocks", description: "While both profiles exist." },
          { term: "Participant reports", description: "During handling and for 12 months after case closure, unless a specific continuing need is documented and reviewed, such as an ongoing dispute or justification for an active sanction." },
          { term: "Future-night email subscription", description: "Three years from subscription or the last explicit subscription confirmation. Unsubscribe stops announcements immediately. Sends, opens and ordinary app activity do not restart the period." },
          { term: "Announcement unsubscribe record", description: "Three years from unsubscribe, retaining only the email address, unsubscribe date and do-not-send status to prevent unwanted announcements. Deleting this record at expiry does not resubscribe anyone; resuming announcements requires a new explicit agreement." },
          { term: "Application email-delivery records", description: "30 days after successful sending or definitive abandonment after failure. This covers the recipient address in the delivery record, delivery data, dates, status and errors. Information needed to respect unsubscribe choices and prevent sending to blocked addresses is handled separately." },
          { term: "Privacy requests and responses", description: "12 months after closure. Supporting documents and copies of participant data are removed sooner when no longer needed. Necessary evidence may be retained longer for an ongoing dispute." },
        ],
        after: [
          "Arrival, departure and other participation records are separate from chat and are not automatically erased when the night ends.",
          "We use activity data from the venue night to understand registrations, participation, likes, matches and conversations started. At the end of the night, we retain grouped statistics without participant names or account identifiers, message content or individual interaction histories.",
          "Technical logs and backups can have separate retention periods. Deleting data from the active application does not necessarily erase every backup immediately. Database backups do not include the actual photo files stored through Supabase Storage. We cannot recall copies that another participant has already downloaded.",
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
          "Depending on the processing and applicable law, you can request access to your personal data, correction, deletion or restriction of use. You can also object to processing based on legitimate interests and request portability where its conditions apply. You can withdraw consent without affecting the lawfulness of earlier processing.",
          `For these requests, contact ${PRIVACY_EMAIL}. We respond without undue delay and normally within one month. If complexity or the number of requests requires an extension, we will explain the reason within that first month; the extension can be up to two additional months.`,
          "We may ask for proportionate information if we have reasonable doubts about your identity. We do not require identity documents systematically. We protect other people’s rights when responding and explain any applicable limits to a request.",
          "You can stop future-night announcements using the unsubscribe link in our emails. This does not itself delete your profile. Matching consent can be withdrawn from your profile as described above.",
          "You can complain to the competent data protection authority, including the CNIL in France. You do not need to contact us before doing so.",
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
    contents: "Sur cette page", back: "Retour à Amourette", authority: "Contacter la CNIL en France",
    sections: [
      {
        id: "operator", title: "Qui sommes-nous et comment nous contacter ?",
        paragraphs: [
          "Amourette est exploité par InboxPilot, Inc., l’organisation responsable des traitements de données personnelles décrits dans cette politique.",
          "Adresse de contact : 2810 N Church St PMB 16104, Wilmington, Delaware 19802-4447, États-Unis.",
          `Pour toute question sur tes données personnelles ou pour exercer tes droits, écris à ${PRIVACY_EMAIL}.`,
          "Cette politique explique comment nous utilisons tes données lorsque tu visites Amourette, crées un profil, participes à une soirée dans un établissement ou contactes notre équipe. Amourette s’adresse aux personnes majeures de 18 ans et plus.",
        ],
      },
      {
        id: "data", title: "Quelles données utilisons-nous et d’où viennent-elles ?",
        paragraphs: [
          "Tu fournis les informations de ton profil : prénom, photos, biographie facultative, genre, préférences de rencontre et confirmation que tu as au moins 18 ans. Nous recevons également les messages et les signalements que tu choisis d’envoyer dans l’application, et conservons les informations sur le traitement de ces signalements. Nous recevons les emails que tu adresses à l’équipe, notamment tes questions et demandes concernant tes données. Nous recueillons ton adresse email si tu t’inscris aux annonces des prochaines soirées ou si tu nous écris.",
          "L’utilisation du service génère des identifiants de compte et de session, des enregistrements d’arrivée et de départ d’une soirée, des dates d’activité, des likes, des matchs réciproques et de l’activité de conversation. Les enregistrements de participation indiquent l’établissement fréquenté. D’autres participants peuvent fournir des informations te concernant dans un signalement ou un message.",
          "Les services techniques traitent aussi les informations nécessaires au fonctionnement et à la protection de l’application, comme les chemins des requêtes, les adresses IP, les informations du navigateur et les erreurs. Ton navigateur conserve des informations de session, des réglages et des brouillons, comme expliqué plus bas.",
          "Un profil et une confirmation de majorité sont nécessaires pour accéder à l’expérience des participants. Le matching nécessite ton accord pour l’utilisation décrite de ton genre et de tes préférences de rencontre. La biographie et l’inscription aux annonces sont facultatives.",
        ],
      },
      {
        id: "purposes", title: "Pourquoi utilisons-nous tes données ?",
        paragraphs: ["Nous utilisons tes données pour :"],
        items: [
          "Gérer ton profil et ta session et montrer qui participe à une soirée.",
          "Proposer des participants mutuellement compatibles, traiter les likes discrètement et ouvrir une conversation lorsque deux personnes se likent réciproquement.",
          "Transmettre les messages entre participants ayant matché pendant la soirée.",
          "Vérifier les photos manuellement, traiter les signalements et les blocages et protéger les participants.",
          "Évaluer et améliorer les soirées grâce à des statistiques sur l’entrée dans l’application, la participation, les likes, les matchs et les conversations commencées.",
          "Envoyer les annonces des prochaines soirées si tu choisis de t’y inscrire.",
          "Répondre aux demandes, assurer le fonctionnement du service et respecter les obligations légales applicables.",
        ],
        after: [
          "Ces statistiques nous aident à repérer les difficultés d’entrée, à comprendre si les matchs se répartissent entre les participants et à mesurer s’ils débouchent sur un échange. Elles ne permettent pas de savoir si les participants se sont réellement parlé en personne. Après la soirée, le rapport conservé contient des statistiques regroupées, sans noms ni identifiants de compte, sans contenu des messages ni historique individuel des interactions.",
          "Bases légales : l’utilisation de ton genre et de tes préférences pour le matching repose sur ton consentement explicite. Les emails d’annonce des prochaines soirées font l’objet d’un consentement distinct. Nous traitons les données nécessaires à la gestion de ton compte et de ta session et à ta participation aux soirées pour exécuter notre contrat de service avec toi.",
          "Nous utilisons les données nécessaires au traitement des signalements et à la protection des participants et du service sur la base de nos intérêts légitimes à prévenir les abus et à maintenir un service sûr, dans le respect des droits des personnes concernées. Nous utilisons les informations nécessaires pour traiter tes demandes relatives à tes données et respecter nos obligations légales en matière de protection des données.",
          "Nous mesurons les scans de QR, les profils complétés et les entrées dans la salle pour comprendre et améliorer le parcours d’entrée, sur la base de notre intérêt légitime à évaluer et améliorer le service, avec les seules données nécessaires à cette fin. Les autres finalités nécessitent leurs propres bases légales.",
        ],
      },
      {
        id: "matching", title: "Tes préférences de rencontre et tes choix",
        paragraphs: [
          "Nous utilisons ton genre et les genres des personnes que tu souhaites rencontrer pour te proposer des personnes compatibles à la même soirée et leur montrer ton profil. Ces choix peuvent révéler des informations sur ton orientation sexuelle.",
          "Tu peux retirer ton consentement au matching à tout moment depuis ton profil. Ce retrait enlève immédiatement ton profil de la découverte et arrête les nouveaux likes et matchs. Nous cessons l’utilisation concernée de tes préférences et lançons leur suppression.",
          "Tes conversations existantes restent accessibles jusqu’à la fin définitive de la soirée, sous réserve des règles habituelles de présence, de blocage et de modération. Elles sont ensuite supprimées. Retirer ce consentement est différent de supprimer ton compte.",
          "Le retrait ne remet pas en cause la licéité des traitements effectués auparavant. Il ne t’inscrit ni ne te désinscrit des emails des prochaines soirées.",
        ],
      },
      {
        id: "recipients", title: "Qui peut recevoir tes données ?",
        paragraphs: [
          "Les autres participants éligibles voient les informations de profil présentées par l’application, comme ton prénom, ta photo et ta biographie, dans le cadre de la soirée. Les likes restent discrets : une conversation ne s’ouvre que si l’intérêt est réciproque. Les messages sont accessibles aux participants du match.",
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
          "Notre opérateur est établi aux États-Unis. Des membres de l’équipe ou des prestataires peuvent traiter des données ou y accéder depuis l’extérieur de l’Espace économique européen. Une base hébergée dans l’UE ne signifie pas que tous les traitements restent dans l’UE.",
          `Pour obtenir des informations sur les traitements internationaux et les garanties de transfert applicables, contacte ${PRIVACY_EMAIL}.`,
        ],
      },
      {
        id: "retention", title: "Combien de temps conservons-nous les données ?",
        paragraphs: ["Nous conservons tes données pendant les durées décrites ci-dessous."],
        entries: [
          { term: "Profil et photos actuelles", description: "Conservés entre les soirées, puis supprimés après deux ans sans utilisation volontaire de l’application, ou plus tôt à la suite d’une demande de suppression valide. Le renouvellement automatique de la session ne prolonge pas ce délai." },
          { term: "Genre et préférences de rencontre", description: "La durée du profil s’applique tant que le consentement reste actif ; son retrait arrête l’utilisation concernée et déclenche leur suppression plus tôt." },
          { term: "Preuves du consentement au matching", description: "Tant que nous nous appuyons sur le consentement, puis 12 mois après son retrait ou la suppression du compte, selon le premier événement. Seuls la référence du compte, les dates d’accord et de retrait et la version du texte accepté sont conservés, sans préférences, photos ni messages. Un nouvel accord ne prolonge pas la conservation des anciennes preuves. Les preuves nécessaires peuvent être conservées plus longtemps en cas de litige en cours, jusqu’à sa résolution." },
          { term: "Brouillon d’inscription inachevé sur ton appareil", description: "Reprise possible pendant 24 heures après ta dernière modification volontaire, puis brouillon écarté et effacé lors du prochain nettoyage exécuté par l’application. Effacé plus tôt si le profil est créé avec succès. Rouvrir ou recharger ne prolonge pas ce délai." },
          { term: "Likes, matchs et conversations de la soirée", description: "Supprimés à la fin définitive de la soirée. Une pause temporaire ne termine pas la soirée." },
          { term: "Photos remplacées et propositions de remplacement refusées", description: "Supprimées par le nettoyage programmé dès qu’aucune photo actuelle ou en attente n’a besoin du fichier et que son envoi remonte à plus de 24 heures. Il ne s’agit pas d’un délai supplémentaire de 24 heures après le remplacement." },
          { term: "Photo affichée rejetée par la modération", description: "Masquée immédiatement sur les profils visibles des participants. La protection du fichier prend fin lors de l’approbation d’un remplacement ou après 30 jours sans correction, sous réserve du seuil habituel d’ancienneté depuis l’envoi et du nettoyage programmé." },
          { term: "Décisions de modération des photos", description: "Pendant la correction, puis 12 mois après sa résolution ; les preuves nécessaires peuvent être conservées plus longtemps en cas de litige en cours. Cette règle ne conserve pas les images supprimées." },
          { term: "Blocages", description: "Tant que les deux profils existent." },
          { term: "Signalements de participants", description: "Pendant leur traitement et 12 mois après la clôture du dossier, sauf besoin précis de conservation supplémentaire, documenté et réexaminé, comme un litige en cours ou la justification d’une sanction active." },
          { term: "Inscription aux emails des prochaines soirées", description: "Trois ans à partir de l’inscription ou de sa dernière confirmation explicite. La désinscription arrête immédiatement les annonces. Les envois, ouvertures et activités ordinaires dans l’application ne relancent pas ce délai." },
          { term: "Trace de désinscription des annonces", description: "Trois ans après la désinscription, avec uniquement l’adresse email, la date de désinscription et le statut de non-envoi pour éviter les annonces non souhaitées. Supprimer cette trace à son expiration ne réinscrit personne ; la reprise des annonces nécessite un nouvel accord explicite." },
          { term: "Enregistrements de livraison des emails de l’application", description: "30 jours après l’envoi réussi ou l’abandon définitif après échec. Cela couvre l’adresse du destinataire dans l’enregistrement, les données de livraison, les dates, le statut et les erreurs. Les informations nécessaires au respect des désinscriptions et à la prévention des envois aux adresses bloquées sont traitées séparément." },
          { term: "Demandes relatives aux données et réponses", description: "12 mois après la clôture. Les justificatifs et copies des données des participants sont supprimés plus tôt lorsqu’ils ne sont plus nécessaires. Les preuves nécessaires peuvent être conservées plus longtemps en cas de litige en cours." },
        ],
        after: [
          "Les enregistrements d’arrivée, de départ et de participation sont distincts des conversations et ne sont pas automatiquement effacés à la fin de la soirée.",
          "Nous utilisons les données d’activité de la soirée pour comprendre les inscriptions, la participation, les likes, les matchs et les conversations commencées. À la fin de la soirée, nous conservons des statistiques regroupées sans noms ni identifiants de compte, sans contenu des messages ni historique individuel des interactions.",
          "Les journaux techniques et les sauvegardes peuvent avoir des durées de conservation distinctes. La suppression dans l’application active n’efface pas nécessairement toutes les sauvegardes immédiatement. Les sauvegardes de la base de données n’incluent pas les fichiers photo stockés dans Supabase Storage. Nous ne pouvons pas récupérer les copies déjà téléchargées par un autre participant.",
        ],
      },
      {
        id: "storage", title: "Stockage dans ton navigateur",
        paragraphs: [
          "L’application utilise le stockage du navigateur pour la session, les préférences d’interface, les brouillons de profil et des fonctions comme l’état de lecture des conversations. Certaines informations peuvent ainsi rester sur ton appareil entre les visites. Effacer les données du navigateur peut supprimer les brouillons locaux et interrompre l’accès à ta session existante.",
          "Tu peux reprendre un brouillon de profil pendant 24 heures après ta dernière modification volontaire. Cela concerne le prénom, la biographie, la photo et l’avancement du formulaire enregistrés sur ton appareil ; le genre et les préférences de rencontre ne sont pas enregistrés dans le brouillon persistant. Les brouillons sont effacés une fois ton profil créé avec succès.",
          "Un brouillon expiré n’est plus restauré et est effacé lors du prochain nettoyage exécuté par l’application, notamment à sa réouverture. L’application ne peut pas effacer le stockage de ton appareil lorsqu’elle est fermée. Rouvrir ou recharger ne prolonge pas la durée du brouillon.",
        ],
      },
      {
        id: "rights", title: "Tes droits",
        paragraphs: [
          "Selon le traitement et la loi applicable, tu peux demander l’accès à tes données, leur rectification, leur suppression ou la limitation de leur utilisation. Tu peux aussi t’opposer aux traitements fondés sur l’intérêt légitime et demander la portabilité lorsque ses conditions sont réunies. Tu peux retirer ton consentement sans remettre en cause la licéité des traitements antérieurs.",
          `Pour ces demandes, contacte ${PRIVACY_EMAIL}. Nous répondons sans retard injustifié et normalement sous un mois. Si la complexité ou le nombre des demandes nécessite une prolongation, nous t’en expliquons la raison dans ce premier mois ; la prolongation peut aller jusqu’à deux mois supplémentaires.`,
          "Nous pouvons demander des informations proportionnées en cas de doute raisonnable sur ton identité. Nous ne demandons pas systématiquement de pièce d’identité. Nous protégeons les droits des autres personnes dans nos réponses et expliquons les limites éventuellement applicables à une demande.",
          "Tu peux arrêter les annonces des prochaines soirées grâce au lien de désinscription dans nos emails. Cela ne supprime pas ton profil. Tu peux retirer le consentement au matching depuis ton profil, comme expliqué plus haut.",
          "Tu peux saisir l’autorité de protection des données compétente, notamment la CNIL en France. Tu n’as pas besoin de nous contacter au préalable.",
        ],
      },
      {
        id: "security", title: "Sécurité",
        paragraphs: ["Nous utilisons des contrôles d’accès, des sessions authentifiées, un stockage restreint des photos et des connexions réseau chiffrées pour protéger les données personnelles. Nous examinons les incidents et prenons les mesures adaptées pour en limiter les effets. Lorsque cela est requis, nous informons l’autorité compétente et les personnes concernées."],
      },
      {
        id: "changes", title: "Modifications de cette politique",
        paragraphs: ["Nous daterons les mises à jour de cette politique et t’informerons des changements importants par un canal approprié. Lorsqu’un changement nécessite ton consentement, nous le demanderons séparément. Continuer à utiliser le service ne constitue pas, à lui seul, un consentement à une nouvelle finalité."],
      },
    ],
  },
  es: {
    updated: "Última actualización: 6 de octubre de 2026",
    contents: "En esta página", back: "Volver a Amourette", authority: "Contactar con la CNIL en Francia",
    sections: [
      {
        id: "operator", title: "Quiénes somos y cómo contactarnos",
        paragraphs: [
          "Amourette está operado por InboxPilot, Inc., la organización responsable del tratamiento de datos personales descrito en esta política.",
          "Dirección de contacto: 2810 N Church St PMB 16104, Wilmington, Delaware 19802-4447, Estados Unidos.",
          `Para consultas sobre tus datos personales o para ejercer tus derechos, escribe a ${PRIVACY_EMAIL}.`,
          "Esta política explica cómo usamos tus datos cuando visitas Amourette, creas un perfil, participas en una noche en un local o contactas con nuestro equipo. Amourette está destinado a personas adultas de 18 años o más.",
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
          "Bases legales: el uso de tu género y preferencias para el matching requiere tu consentimiento explícito. Los emails de anuncios de próximas noches usan un consentimiento separado. Tratamos los datos necesarios para gestionar tu cuenta y sesión y permitir tu participación en las noches para ejecutar nuestro contrato de servicio contigo.",
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
          "Nuestro operador está establecido en Estados Unidos y miembros del equipo o proveedores pueden tratar datos o acceder a ellos desde fuera del Espacio Económico Europeo. Alojar la base de datos en la UE no significa que todo el tratamiento permanezca en la UE.",
          `Para obtener información sobre el tratamiento internacional y las garantías de transferencia aplicables, contacta con ${PRIVACY_EMAIL}.`,
        ],
      },
      {
        id: "retention", title: "Cuánto tiempo conservamos los datos",
        paragraphs: ["Conservamos tus datos durante los plazos descritos a continuación."],
        entries: [
          { term: "Perfil y fotos actuales", description: "Entre noches, con eliminación tras dos años sin uso voluntario de la aplicación, o antes tras una solicitud válida de eliminación. La renovación automática de la sesión no prolonga el plazo." },
          { term: "Género y preferencias de citas", description: "Se aplica el plazo del perfil mientras el consentimiento siga activo; su retirada detiene el uso cubierto e inicia la eliminación antes." },
          { term: "Pruebas del consentimiento al matching", description: "Mientras nos basemos en el consentimiento y durante 12 meses después de su retirada o de la eliminación de la cuenta, lo que ocurra primero. Solo se conservan la referencia de cuenta, las fechas de aceptación y retirada y la versión del texto aceptado, sin preferencias, fotos ni mensajes. Un nuevo acuerdo no prolonga el plazo de las pruebas anteriores. Las pruebas necesarias pueden conservarse más tiempo si hay un litigio en curso, hasta su resolución." },
          { term: "Borrador de registro inacabado en tu dispositivo", description: "Disponible para retomarlo durante 24 horas desde tu última edición voluntaria; después se descarta y se borra cuando la aplicación vuelve a ejecutar su limpieza. Se borra antes si el perfil se crea correctamente. Reabrir o recargar no prolonga el plazo." },
          { term: "Likes, matches y conversaciones de la noche", description: "Se eliminan al final definitivo de la noche. Las pausas temporales no terminan la noche." },
          { term: "Fotos sustituidas y propuestas de sustitución rechazadas", description: "Se eliminan mediante limpieza programada cuando ninguna foto actual o pendiente necesita el archivo y han pasado más de 24 horas desde su subida. No son 24 horas adicionales desde la sustitución." },
          { term: "Foto mostrada que la moderación rechaza", description: "Se oculta inmediatamente en los perfiles visibles para participantes. La protección del archivo termina al aprobarse una sustitución o tras 30 días sin corrección, sujeta al umbral habitual de antigüedad desde la subida y a la limpieza programada." },
          { term: "Decisiones de moderación de fotos", description: "Mientras la corrección siga activa y durante 12 meses después de su resolución; las pruebas necesarias pueden conservarse más tiempo si hay un litigio en curso. Esta regla no conserva las imágenes eliminadas." },
          { term: "Bloqueos", description: "Mientras existan ambos perfiles." },
          { term: "Denuncias de participantes", description: "Durante su gestión y durante 12 meses después del cierre del caso, salvo que se documente y revise una necesidad concreta de conservación adicional, como un litigio en curso o la justificación de una sanción activa." },
          { term: "Suscripción a emails de próximas noches", description: "Tres años desde la suscripción o su última confirmación explícita. La baja detiene los anuncios inmediatamente. Los envíos, las aperturas y la actividad ordinaria en la aplicación no reinician el plazo." },
          { term: "Registro de baja de los anuncios", description: "Tres años desde la baja, conservando solo la dirección de email, la fecha de baja y el estado de no envío para evitar anuncios no deseados. Eliminar este registro al caducar no vuelve a suscribir a nadie; reanudar los anuncios requiere un nuevo acuerdo explícito." },
          { term: "Registros de entrega de emails de la aplicación", description: "30 días después del envío correcto o del abandono definitivo tras un fallo. Incluye la dirección del destinatario en el registro, datos de entrega, fechas, estado y errores. La información necesaria para respetar las bajas y evitar envíos a direcciones bloqueadas se gestiona por separado." },
          { term: "Solicitudes de privacidad y respuestas", description: "12 meses después del cierre. Los justificantes y copias de datos de participantes se eliminan antes cuando dejan de ser necesarios. Las pruebas necesarias pueden conservarse más tiempo si hay un litigio en curso." },
        ],
        after: [
          "Los registros de llegada, salida y otra participación son distintos de las conversaciones y no se borran automáticamente al terminar la noche.",
          "Usamos los datos de actividad de la noche para entender los registros, la participación, los likes, los matches y las conversaciones iniciadas. Al terminar la noche, conservamos estadísticas agrupadas sin nombres ni identificadores de cuenta, contenido de mensajes ni historiales individuales de interacciones.",
          "Los registros técnicos y las copias de seguridad pueden tener plazos distintos. Borrar datos de la aplicación activa no elimina necesariamente todas las copias de seguridad de inmediato. Las copias de la base de datos no incluyen los archivos de fotos almacenados en Supabase Storage. No podemos recuperar las copias que otro participante ya haya descargado.",
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
          "Según el tratamiento y la legislación aplicable, puedes solicitar acceso a tus datos, su rectificación, eliminación o la limitación de su uso. También puedes oponerte a los tratamientos basados en intereses legítimos y solicitar la portabilidad cuando se cumplan sus condiciones. Puedes retirar el consentimiento sin afectar a la licitud de los tratamientos anteriores.",
          `Para estas solicitudes, contacta con ${PRIVACY_EMAIL}. Respondemos sin demora injustificada y normalmente en un mes. Si la complejidad o el número de solicitudes exige una prórroga, explicaremos el motivo dentro de ese primer mes; la prórroga puede ser de hasta dos meses adicionales.`,
          "Podemos solicitar información proporcionada si tenemos dudas razonables sobre tu identidad. No pedimos documentos de identidad sistemáticamente. Protegemos los derechos de otras personas al responder y explicamos los límites aplicables a una solicitud.",
          "Puedes detener los anuncios de próximas noches mediante el enlace de baja de nuestros emails. Esto no elimina tu perfil. Puedes retirar el consentimiento al matching desde tu perfil, como se explica anteriormente.",
          "Puedes presentar una reclamación ante la autoridad de protección de datos competente, incluida la CNIL en Francia. No necesitas contactarnos antes de hacerlo.",
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
