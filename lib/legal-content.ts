import type { Locale } from "@/lib/strings";
import { GENERAL_EMAIL, type LegalDocumentKind } from "@/lib/legal";
import { PRIVACY_EMAIL } from "@/lib/privacy-contact";

type LegalSection = {
  id: string;
  title: string;
  paragraphs: string[];
  items?: string[];
  after?: string[];
};

// Editable EN/FR/ES reference copy for #292. Review notes and publication gaps
// belong in docs/reports/launch-legal-notices-and-terms.md, not participant UI.
export const legalContent: Record<Locale, Record<LegalDocumentKind, LegalSection[]>> = {
  en: {
    legal: [
      { id: "publisher", title: "Publisher and contact", paragraphs: [
        "Amourette is published and operated by InboxPilot, Inc.",
        "Contact address: 2810 N Church St PMB 16104, Wilmington, Delaware 19802-4447, USA.",
        "Publication director: Samih Sghier.",
        `For general questions or complaints, email ${GENERAL_EMAIL}.`,
      ] },
      { id: "hosting", title: "Hosting and data storage", paragraphs: [
        "The website and application are hosted by Vercel Inc. (vercel.com). Company contact address: 440 N Barranca Avenue #4133, Covina, CA 91723, USA.",
        "This is the company’s postal address, not an indication of where your data is stored. See our Privacy Policy for information about data hosting and international processing.",
        "Database and photo storage services are provided by Supabase (supabase.com).",
      ] },
      { id: "privacy", title: "Terms and personal data", paragraphs: [
        "The Terms of Use explain the rules for participating in Amourette. Our Privacy Policy explains how personal data is used and how to exercise your rights.",
        `For personal-data questions or requests, email ${PRIVACY_EMAIL}.`,
      ] },
    ],
    terms: [
      { id: "service", title: "About Amourette", paragraphs: [
        "Amourette is operated by InboxPilot, Inc. It helps people participating in the same venue night discover mutual interest and start an in-person conversation. These terms explain the rules for using the service.",
        `For questions or complaints, contact ${GENERAL_EMAIL}. Our Legal Notice provides the operator’s contact details.`,
      ] },
      { id: "profile", title: "Adults and personal profiles", paragraphs: [
        "You must be at least 18 and meet any higher age or admission requirement that applies to the venue or event. Using the app does not give you a right of entry to a venue.",
        "Use your own profile, provide accurate information and use photos that represent you and that you are entitled to share. Do not impersonate another person, lend your account or create another account to bypass a block or restriction. Keep access to your device and session secure.",
      ] },
      { id: "nights", title: "Venue nights, likes and conversations", paragraphs: [
        "Join a venue night when you are attending it, and use the leave control when you leave. Discovery depends on the night’s status, your presence, your preferences and the safety controls in the app. Your profile can remain available for future nights after the current night ends.",
        "Likes are discreet. A conversation opens only when two people like each other. A match never obliges either person to reply, meet or agree to physical or sexual contact. Respect the other person’s choices at every stage.",
        "Messaging can pause when a participant leaves or the night is paused. Likes, matches and conversations are deleted at the definitive end of the night; a temporary pause does not delete them. Blocks and moderation can restrict access earlier.",
      ] },
      { id: "conduct", title: "Respect and permitted use", paragraphs: [
        "Treat other people with respect, in the app and during encounters connected with the service. Do not:",
      ], items: [
        "Harass, threaten, discriminate, intimidate or continue unwanted contact.",
        "Publish unlawful, hateful or sexually explicit profile content, or send unwanted sexual messages.",
        "Impersonate someone, defraud participants, send spam or solicit money.",
        "Share another person’s private information, photos or conversations without permission, except where necessary to report harm or exercise a legal right.",
        "Collect other participants’ data in bulk, compromise the service or bypass access, blocking or moderation controls.",
      ], after: [
        "You retain your rights in the content you share. You authorize us to host, display and transmit it only as needed to provide and moderate the service. This does not grant permission to use your photos in advertising.",
      ] },
      { id: "safety", title: "Reporting, blocking and moderation", paragraphs: [
        "You can report or block a participant using the available in-app controls. Blocking prevents your profiles from being shown to each other and closes your conversations; the blocked person receives no notification. A report does not automatically block the person: choose blocking separately if you want it.",
        "To protect participants or address a breach of these rules, we may ask for a profile correction, hide inappropriate profile content, temporarily restrict access or remove a participant from the current night. We consider the seriousness and repetition of the behavior and the information available. Urgent protective action may be taken before review is complete.",
        `To ask for an explanation or a review of a moderation decision, contact ${GENERAL_EMAIL}. We consider your explanation while protecting the privacy and safety of the people involved.`,
        "Reporting is not an emergency service. If there is immediate danger, contact venue staff or the local emergency services.",
      ] },
      { id: "privacy", title: "Your choices and personal data", paragraphs: [
        `You can stop participating and leave the venue night at any time. To request account deletion, contact ${PRIVACY_EMAIL}.`,
        "Our Privacy Policy explains the use of your data and your rights. Agreement to these terms does not replace the separate consent for matching preferences or optional announcement emails. Matching consent can be withdrawn from your profile; the Privacy Policy explains the effects on discovery and existing conversations.",
      ] },
      { id: "availability", title: "Availability, encounters and reservations", paragraphs: [
        "We take reasonable care in operating the service, but technical incidents or maintenance may interrupt it. Amourette does not guarantee a match, a reply or a meeting. Profile moderation is not identity verification or a guarantee of another person’s conduct.",
        "If a night requires a reservation or payment, its price, cancellation and refund conditions are provided separately before booking. These terms do not determine whether a deposit is refunded.",
        "Nothing in these terms excludes liability or limits consumer rights where applicable law does not allow it.",
      ] },
      { id: "changes", title: "Changes and questions", paragraphs: [
        "We date updates to these terms and communicate material changes before they take effect, with any notice or agreement required by applicable law. Changes do not apply retroactively.",
        `For questions, complaints or requests to review a moderation decision, write to ${GENERAL_EMAIL}. Contacting us does not limit your available legal remedies or your right to bring a matter before a competent court.`,
      ] },
    ],
  },
  fr: {
    legal: [
      { id: "publisher", title: "Éditeur et contact", paragraphs: [
        "Amourette est édité et exploité par InboxPilot, Inc.",
        "Adresse de contact : 2810 N Church St PMB 16104, Wilmington, Delaware 19802-4447, États-Unis.",
        "Directeur de la publication : Samih Sghier.",
        `Pour toute question générale ou réclamation, écrivez à ${GENERAL_EMAIL}.`,
      ] },
      { id: "hosting", title: "Hébergement et stockage des données", paragraphs: [
        "Le site et l’application sont hébergés par Vercel Inc. (vercel.com). Adresse de contact de l’entreprise : 440 N Barranca Avenue #4133, Covina, CA 91723, États-Unis.",
        "Il s’agit de l’adresse postale de l’entreprise, pas d’une indication du lieu de stockage de vos données. Consultez notre politique de confidentialité pour les informations sur l’hébergement des données et les traitements internationaux.",
        "Les services de base de données et de stockage des photos sont fournis par Supabase (supabase.com).",
      ] },
      { id: "privacy", title: "Conditions d’utilisation et données personnelles", paragraphs: [
        "Les conditions d’utilisation expliquent les règles de participation à Amourette. Notre politique de confidentialité explique comment vos données personnelles sont utilisées et comment exercer vos droits.",
        `Pour toute question ou demande concernant vos données personnelles, écrivez à ${PRIVACY_EMAIL}.`,
      ] },
    ],
    terms: [
      { id: "service", title: "À propos d’Amourette", paragraphs: [
        "Amourette est exploité par InboxPilot, Inc. Le service permet aux personnes participant à une même soirée dans un établissement de découvrir un intérêt réciproque et d’engager une conversation sur place. Ces conditions expliquent les règles d’utilisation du service.",
        `Pour toute question ou réclamation, contactez ${GENERAL_EMAIL}. Les mentions légales donnent les coordonnées de l’exploitant.`,
      ] },
      { id: "profile", title: "Majorité et profil personnel", paragraphs: [
        "Vous devez avoir au moins 18 ans et respecter toute condition d’âge plus élevé ou d’admission applicable à l’établissement ou à l’événement. L’utilisation de l’application ne vous donne pas un droit d’entrée dans un établissement.",
        "Utilisez votre propre profil, fournissez des informations exactes et utilisez des photos qui vous représentent et que vous avez le droit de partager. N’usurpez pas l’identité d’une autre personne, ne prêtez pas votre compte et ne créez pas un autre compte pour contourner un blocage ou une restriction. Protégez l’accès à votre appareil et à votre session.",
      ] },
      { id: "nights", title: "Soirées, likes et conversations", paragraphs: [
        "Rejoignez une soirée lorsque vous y participez et utilisez le bouton de départ quand vous quittez les lieux. La découverte des profils dépend de l’état de la soirée, de votre présence, de vos préférences et des protections de l’application. Votre profil peut être conservé pour de prochaines soirées après la fin de celle en cours.",
        "Les likes sont discrets. Une conversation s’ouvre uniquement lorsque deux personnes se likent réciproquement. Un match n’oblige jamais à répondre, à rencontrer quelqu’un ou à accepter un contact physique ou sexuel. Respectez les choix de l’autre personne à chaque étape.",
        "La messagerie peut être suspendue lorsqu’une personne quitte la soirée ou que celle-ci est mise en pause. Les likes, matchs et conversations sont supprimés à la fin définitive de la soirée ; une pause temporaire ne les supprime pas. Un blocage ou une mesure de modération peut en restreindre l’accès plus tôt.",
      ] },
      { id: "conduct", title: "Respect des autres et utilisation autorisée", paragraphs: [
        "Respectez les autres personnes, dans l’application et lors des rencontres liées au service. Il est interdit de :",
      ], items: [
        "Harceler, menacer, discriminer, intimider ou poursuivre un contact non désiré.",
        "Publier des contenus de profil illicites, haineux ou sexuellement explicites, ou envoyer des messages sexuels non désirés.",
        "Usurper une identité, escroquer des participants, envoyer du spam ou solliciter de l’argent.",
        "Partager les informations privées, photos ou conversations d’une autre personne sans son accord, sauf lorsque cela est nécessaire pour signaler un préjudice ou exercer un droit.",
        "Collecter en masse les données des participants, compromettre le service ou contourner les contrôles d’accès, de blocage ou de modération.",
      ], after: [
        "Vous conservez vos droits sur les contenus que vous partagez. Vous nous autorisez à les héberger, les afficher et les transmettre uniquement pour fournir et modérer le service. Cela n’autorise pas l’utilisation de vos photos dans une publicité.",
      ] },
      { id: "safety", title: "Signalement, blocage et modération", paragraphs: [
        "Vous pouvez signaler ou bloquer une personne à l’aide des commandes disponibles dans l’application. Le blocage masque vos profils l’un pour l’autre et ferme vos conversations ; la personne bloquée ne reçoit pas de notification. Un signalement ne bloque pas automatiquement la personne : choisissez aussi le blocage si vous le souhaitez.",
        "Pour protéger les participants ou répondre à un non-respect de ces règles, nous pouvons demander une correction du profil, masquer un contenu de profil inapproprié, restreindre temporairement l’accès ou exclure une personne de la soirée en cours. Nous tenons compte de la gravité et de la répétition des faits ainsi que des informations disponibles. Une mesure de protection urgente peut être prise avant la fin de l’examen.",
        `Pour demander une explication ou un réexamen d’une décision de modération, contactez ${GENERAL_EMAIL}. Nous prenons en compte vos explications tout en protégeant la vie privée et la sécurité des personnes concernées.`,
        "Le signalement n’est pas un service d’urgence. En cas de danger immédiat, contactez le personnel de l’établissement ou les services de secours locaux.",
      ] },
      { id: "privacy", title: "Vos choix et vos données personnelles", paragraphs: [
        `Vous pouvez cesser de participer et quitter la soirée à tout moment. Pour demander la suppression de votre compte, contactez ${PRIVACY_EMAIL}.`,
        "Notre politique de confidentialité explique l’utilisation de vos données et vos droits. L’acceptation de ces conditions ne remplace pas les consentements distincts pour les préférences de rencontre et les emails d’annonce facultatifs. Vous pouvez retirer votre consentement au matching depuis votre profil ; la politique de confidentialité explique les effets sur la découverte des profils et les conversations existantes.",
      ] },
      { id: "availability", title: "Disponibilité, rencontres et réservations", paragraphs: [
        "Nous apportons un soin raisonnable au fonctionnement du service, mais des incidents techniques ou des opérations de maintenance peuvent l’interrompre. Amourette ne garantit ni match, ni réponse, ni rencontre. La modération d’un profil ne constitue pas une vérification d’identité ni une garantie du comportement d’une autre personne.",
        "Lorsqu’une soirée nécessite une réservation ou un paiement, son prix et ses conditions d’annulation et de remboursement sont présentés séparément avant la réservation. Les présentes conditions ne déterminent pas si un dépôt est remboursé.",
        "Aucune disposition de ces conditions n’exclut une responsabilité ou ne limite les droits des consommateurs lorsque la loi applicable ne le permet pas.",
      ] },
      { id: "changes", title: "Modifications et questions", paragraphs: [
        "Nous datons les mises à jour de ces conditions et communiquons les modifications importantes avant leur entrée en vigueur, avec le préavis ou l’accord requis par la loi applicable. Les modifications ne s’appliquent pas rétroactivement.",
        `Pour toute question, réclamation ou demande de réexamen d’une décision de modération, écrivez à ${GENERAL_EMAIL}. Nous contacter ne limite pas vos recours légaux ni votre droit de saisir une juridiction compétente.`,
      ] },
    ],
  },
  es: {
    legal: [
      { id: "publisher", title: "Editor y contacto", paragraphs: [
        "Amourette es editado y operado por InboxPilot, Inc.",
        "Dirección de contacto: 2810 N Church St PMB 16104, Wilmington, Delaware 19802-4447, Estados Unidos.",
        "Director de la publicación: Samih Sghier.",
        `Para consultas generales o reclamaciones, escribe a ${GENERAL_EMAIL}.`,
      ] },
      { id: "hosting", title: "Alojamiento y almacenamiento de datos", paragraphs: [
        "El sitio web y la aplicación están alojados por Vercel Inc. (vercel.com). Dirección de contacto de la empresa: 440 N Barranca Avenue #4133, Covina, CA 91723, Estados Unidos.",
        "Esta es la dirección postal de la empresa, no una indicación de dónde se almacenan tus datos. Consulta nuestra política de privacidad para obtener información sobre el alojamiento de los datos y su tratamiento internacional.",
        "Supabase proporciona los servicios de base de datos y almacenamiento de fotos (supabase.com).",
      ] },
      { id: "privacy", title: "Condiciones de uso y datos personales", paragraphs: [
        "Las condiciones de uso explican las reglas para participar en Amourette. Nuestra política de privacidad explica cómo se utilizan tus datos personales y cómo ejercer tus derechos.",
        `Para consultas o solicitudes sobre tus datos personales, escribe a ${PRIVACY_EMAIL}.`,
      ] },
    ],
    terms: [
      { id: "service", title: "Sobre Amourette", paragraphs: [
        "Amourette es operado por InboxPilot, Inc. Ayuda a las personas que participan en una misma noche en un local a descubrir un interés mutuo y a iniciar una conversación en persona. Estas condiciones explican las reglas de uso del servicio.",
        `Para consultas o reclamaciones, contacta con ${GENERAL_EMAIL}. Nuestro aviso legal contiene los datos de contacto del operador.`,
      ] },
      { id: "profile", title: "Mayoría de edad y perfiles personales", paragraphs: [
        "Debes tener al menos 18 años y cumplir cualquier requisito de edad superior o de admisión aplicable al local o al evento. Usar la aplicación no te da derecho a entrar en un local.",
        "Usa tu propio perfil, facilita información veraz y utiliza fotos que te representen y que tengas derecho a compartir. No suplantes a otra persona, no prestes tu cuenta ni crees otra para eludir un bloqueo o una restricción. Protege el acceso a tu dispositivo y a tu sesión.",
      ] },
      { id: "nights", title: "Noches, likes y conversaciones", paragraphs: [
        "Únete a una noche cuando estés participando en ella y usa el botón para salir cuando te vayas. El descubrimiento de perfiles depende del estado de la noche, tu presencia, tus preferencias y los controles de seguridad de la aplicación. Tu perfil puede conservarse para futuras noches una vez terminada la actual.",
        "Los likes son discretos. Solo se abre una conversación cuando dos personas se dan like mutuamente. Un match nunca obliga a responder, a quedar ni a aceptar contacto físico o sexual. Respeta las decisiones de la otra persona en todo momento.",
        "La mensajería puede pausarse cuando una persona se va o cuando la noche está en pausa. Los likes, matches y conversaciones se eliminan al terminar definitivamente la noche; una pausa temporal no los elimina. Los bloqueos y la moderación pueden restringir el acceso antes.",
      ] },
      { id: "conduct", title: "Respeto y uso permitido", paragraphs: [
        "Trata a las demás personas con respeto, tanto en la aplicación como durante los encuentros relacionados con el servicio. No está permitido:",
      ], items: [
        "Acosar, amenazar, discriminar, intimidar o insistir en un contacto no deseado.",
        "Publicar contenido de perfil ilícito, de odio o sexualmente explícito, o enviar mensajes sexuales no deseados.",
        "Suplantar identidades, estafar a participantes, enviar spam o solicitar dinero.",
        "Compartir información privada, fotos o conversaciones de otra persona sin su permiso, salvo cuando sea necesario para denunciar un daño o ejercer un derecho legal.",
        "Recopilar datos de participantes de forma masiva, comprometer el servicio o eludir los controles de acceso, bloqueo o moderación.",
      ], after: [
        "Conservas tus derechos sobre el contenido que compartes. Nos autorizas a alojarlo, mostrarlo y transmitirlo únicamente en la medida necesaria para prestar y moderar el servicio. Esto no permite utilizar tus fotos en publicidad.",
      ] },
      { id: "safety", title: "Denuncias, bloqueos y moderación", paragraphs: [
        "Puedes denunciar o bloquear a una persona mediante los controles disponibles en la aplicación. El bloqueo impide que vuestros perfiles se muestren mutuamente y cierra vuestras conversaciones; la persona bloqueada no recibe ninguna notificación. Denunciar no bloquea automáticamente a la persona: selecciona también el bloqueo si lo deseas.",
        "Para proteger a los participantes o responder al incumplimiento de estas reglas, podemos solicitar una corrección del perfil, ocultar contenido de perfil inapropiado, restringir temporalmente el acceso o excluir a una persona de la noche en curso. Consideramos la gravedad y la repetición de la conducta y la información disponible. Podemos tomar medidas urgentes de protección antes de completar la revisión.",
        `Para pedir una explicación o una revisión de una decisión de moderación, contacta con ${GENERAL_EMAIL}. Tendremos en cuenta tu explicación protegiendo la privacidad y la seguridad de las personas implicadas.`,
        "Las denuncias no son un servicio de emergencias. Si hay un peligro inmediato, contacta con el personal del local o con los servicios de emergencia locales.",
      ] },
      { id: "privacy", title: "Tus decisiones y tus datos personales", paragraphs: [
        `Puedes dejar de participar y salir de la noche en cualquier momento. Para solicitar la eliminación de tu cuenta, contacta con ${PRIVACY_EMAIL}.`,
        "Nuestra política de privacidad explica el uso de tus datos y tus derechos. Aceptar estas condiciones no sustituye los consentimientos separados para las preferencias de matching o los emails opcionales de anuncios. Puedes retirar tu consentimiento para el matching desde tu perfil; la política de privacidad explica los efectos sobre el descubrimiento de perfiles y las conversaciones existentes.",
      ] },
      { id: "availability", title: "Disponibilidad, encuentros y reservas", paragraphs: [
        "Actuamos con una diligencia razonable al prestar el servicio, pero las incidencias técnicas o el mantenimiento pueden interrumpirlo. Amourette no garantiza un match, una respuesta ni un encuentro. La moderación de perfiles no verifica la identidad ni garantiza la conducta de otra persona.",
        "Si una noche requiere una reserva o un pago, su precio y las condiciones de cancelación y reembolso se presentan por separado antes de reservar. Estas condiciones no determinan si se devuelve un depósito.",
        "Nada en estas condiciones excluye responsabilidades ni limita los derechos de los consumidores cuando la ley aplicable no lo permite.",
      ] },
      { id: "changes", title: "Cambios y consultas", paragraphs: [
        "Indicamos la fecha de actualización de estas condiciones y comunicamos los cambios importantes antes de que entren en vigor, con el aviso previo o acuerdo que exija la ley aplicable. Los cambios no se aplican retroactivamente.",
        `Para consultas, reclamaciones o solicitudes de revisión de una decisión de moderación, escribe a ${GENERAL_EMAIL}. Contactarnos no limita tus vías legales de reclamación ni tu derecho a acudir a un tribunal competente.`,
      ] },
    ],
  },
};
