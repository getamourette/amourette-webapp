import type { Locale } from './strings';
import type { ReviewField } from './profile-review';

type CorrectionStrings = {
  rejected: string; photoRejected: string; modify: string; modifyPhoto: string;
  heading: string; photoHeading: string; compactCopy: string; hidden: string;
  labels: Record<ReviewField, string>; submit: string; waiting: string; sentTitle: string; sentCopy: string;
  refused: string; unsent: string; sent: string; requested: string; photoCorrection: string; profileCorrection: string; pending: string;
  account: string; return: string; saving: string; confirming: string; error: string; retry: string; loading: string; viewStatus: string;
  roomHiddenTitle: string; roomPhotoCorrection: string; roomProfileCorrection: string; roomPhotoPending: string; roomProfilePending: string;
};

export const correctionStrings: Record<Locale, CorrectionStrings> = {
  en: {
    rejected: 'Your profile needs correcting', photoRejected: 'Your photo needs changing',
    modify: 'Fix my profile', modifyPhoto: 'Fix my photo', heading: 'Correct your profile', photoHeading: 'Change your photo',
    compactCopy: 'Your profile is hidden until approval. Your chats stay open.', hidden: 'Your profile is hidden for now.',
    labels: { first_name: 'First name', bio: 'Bio', photo: 'Profile photo' },
    submit: 'Submit for review', waiting: 'Awaiting approval', sentTitle: 'Thanks, we’ve got it.', sentCopy: 'Our team will review your changes.',
    refused: 'Refused', unsent: 'Not sent yet', sent: 'Sent', requested: 'Correction requested',
    photoCorrection: 'Your photo needs correcting.', profileCorrection: 'Your profile needs correcting.', pending: 'Sent, awaiting approval',
    account: 'Account settings', return: 'Back', saving: 'Sending…', confirming: 'Confirming receipt…',
    error: 'Could not submit your changes. Your edits are still here. Try again.', retry: 'Try again',
    loading: 'Loading your saved changes…', viewStatus: 'View status',
    roomHiddenTitle: "You're hidden tonight",
    roomPhotoCorrection: 'Change your photo to reappear in the room.', roomProfileCorrection: 'Correct your profile to reappear in the room.',
    roomPhotoPending: 'Your photo is being reviewed. You’ll reappear as soon as it’s approved.',
    roomProfilePending: 'Your profile is being reviewed. You’ll reappear as soon as it’s approved.',
  },
  fr: {
    rejected: 'Ton profil est à corriger', photoRejected: 'Ta photo est à changer',
    modify: 'Corriger mon profil', modifyPhoto: 'Corriger ma photo', heading: 'Corrige ton profil', photoHeading: 'Corrige ta photo',
    compactCopy: 'Ton profil est masqué jusqu’à la validation. Tes conversations restent ouvertes.', hidden: 'Ton profil est masqué en attendant.',
    labels: { first_name: 'Prénom', bio: 'Bio', photo: 'Photo de profil' },
    submit: 'Envoyer pour validation', waiting: 'En attente de validation', sentTitle: 'Merci, c’est bien reçu.', sentCopy: 'Notre équipe va vérifier tes modifications.',
    refused: 'Refusée', unsent: 'Pas encore envoyée', sent: 'Envoyée', requested: 'Correction demandée',
    photoCorrection: 'Ta photo doit être corrigée.', profileCorrection: 'Ton profil doit être corrigé.', pending: 'Envoyée, en attente de validation',
    account: 'Paramètres du compte', return: 'Retour', saving: 'Envoi en cours…', confirming: 'On confirme la réception…',
    error: 'Impossible d’envoyer tes modifications. Ta saisie est conservée. Réessaie.', retry: 'Réessayer',
    loading: 'Chargement de tes modifications enregistrées…', viewStatus: 'Voir le statut',
    roomHiddenTitle: 'Tu es masqué·e ce soir',
    roomPhotoCorrection: 'Change ta photo pour réapparaître dans la salle.', roomProfileCorrection: 'Corrige ton profil pour réapparaître dans la salle.',
    roomPhotoPending: 'Ta photo est en vérification. Tu réapparais dès qu’elle est validée.',
    roomProfilePending: 'Ton profil est en vérification. Tu réapparais dès qu’il est validé.',
  },
  es: {
    rejected: 'Tu perfil necesita correcciones', photoRejected: 'Tienes que cambiar tu foto',
    modify: 'Corregir mi perfil', modifyPhoto: 'Corregir mi foto', heading: 'Corrige tu perfil', photoHeading: 'Cambia tu foto',
    compactCopy: 'Tu perfil está oculto hasta su aprobación. Tus conversaciones siguen abiertas.', hidden: 'Tu perfil está oculto por ahora.',
    labels: { first_name: 'Nombre', bio: 'Biografía', photo: 'Foto de perfil' },
    submit: 'Enviar para revisión', waiting: 'Pendiente de aprobación', sentTitle: 'Gracias, lo hemos recibido.', sentCopy: 'Nuestro equipo revisará tus cambios.',
    refused: 'Rechazada', unsent: 'Aún sin enviar', sent: 'Enviada', requested: 'Corrección solicitada',
    photoCorrection: 'Tienes que corregir tu foto.', profileCorrection: 'Tienes que corregir tu perfil.', pending: 'Enviado, pendiente de aprobación',
    account: 'Configuración de la cuenta', return: 'Volver', saving: 'Enviando…', confirming: 'Confirmando la recepción…',
    error: 'No se pudieron enviar los cambios. Tus cambios siguen aquí. Inténtalo de nuevo.', retry: 'Reintentar',
    loading: 'Cargando tus cambios guardados…', viewStatus: 'Ver el estado',
    roomHiddenTitle: 'Tu perfil está oculto esta noche',
    roomPhotoCorrection: 'Cambia tu foto para volver a aparecer en la sala.', roomProfileCorrection: 'Corrige tu perfil para volver a aparecer en la sala.',
    roomPhotoPending: 'Tu foto está en revisión. Volverás a aparecer en cuanto se apruebe.',
    roomProfilePending: 'Tu perfil está en revisión. Volverás a aparecer en cuanto se apruebe.',
  },
};
