import type { Locale } from './strings';
import type { TextReason } from './text-moderation';

type Copy = {
  title: string; first_name: string; bio: string; nameHidden: string; bioHidden: string;
  pending: string; rejected: string; approved: string; cancelled: string; correct: string;
  submit: string; cancel: string; working: string; error: string; retry: string;
  bioHelp: string; emptyBio: string; reasons: Record<TextReason, string>;
};
export const textModerationStrings: Record<Locale, Copy> = {
  en: {
    title: 'Profile correction', first_name: 'First name', bio: 'Bio',
    nameHidden: 'Your profile is hidden from discovery until a corrected first name is approved.',
    bioHidden: 'Your bio is hidden. Your profile can still appear without it. A corrected bio needs approval.',
    pending: 'Waiting for review', rejected: 'This correction was not approved. Please submit another.',
    approved: 'Correction approved', cancelled: 'Correction cancelled', correct: 'Correct my profile',
    submit: 'Submit for review', cancel: 'Cancel this request', working: 'Saving…',
    error: 'Could not confirm the correction status. Please try again.', retry: 'Try again',
    bioHelp: 'Up to 300 characters. You can also submit an empty bio for review.', emptyBio: 'No bio',
    reasons: { sexual: 'Sexual or explicit content', hateful: 'Hateful or discriminatory content',
      harassment: 'Harassing or threatening content', misleading_identity: 'Misleading identity', inappropriate: 'Inappropriate profile content' },
  },
  fr: {
    title: 'Correction du profil', first_name: 'Prénom', bio: 'Bio',
    nameHidden: 'Ton profil est masqué de la découverte jusqu’à la validation d’un prénom corrigé.',
    bioHidden: 'Ta bio est masquée. Ton profil peut rester visible sans elle. Une bio corrigée doit être validée.',
    pending: 'En attente de validation', rejected: 'Cette correction n’a pas été validée. Propose une nouvelle version.',
    approved: 'Correction validée', cancelled: 'Demande annulée', correct: 'Corriger mon profil',
    submit: 'Envoyer pour validation', cancel: 'Annuler cette demande', working: 'Enregistrement…',
    error: 'Impossible de confirmer le statut de la correction. Réessaie.', retry: 'Réessayer',
    bioHelp: '300 caractères maximum. Tu peux aussi proposer une bio vide pour validation.', emptyBio: 'Sans bio',
    reasons: { sexual: 'Contenu sexuel ou explicite', hateful: 'Contenu haineux ou discriminatoire',
      harassment: 'Contenu harcelant ou menaçant', misleading_identity: 'Identité trompeuse', inappropriate: 'Contenu de profil inapproprié' },
  },
  es: {
    title: 'Corrección del perfil', first_name: 'Nombre', bio: 'Bio',
    nameHidden: 'Tu perfil está oculto en descubrimiento hasta que se apruebe un nombre corregido.',
    bioHidden: 'Tu bio está oculta. Tu perfil puede seguir visible sin ella. Una bio corregida necesita aprobación.',
    pending: 'Pendiente de revisión', rejected: 'Esta corrección no se aprobó. Envía otra versión.',
    approved: 'Corrección aprobada', cancelled: 'Solicitud cancelada', correct: 'Corregir mi perfil',
    submit: 'Enviar para revisión', cancel: 'Cancelar esta solicitud', working: 'Guardando…',
    error: 'No se pudo confirmar el estado de la corrección. Inténtalo de nuevo.', retry: 'Reintentar',
    bioHelp: 'Hasta 300 caracteres. También puedes enviar una bio vacía para revisión.', emptyBio: 'Sin bio',
    reasons: { sexual: 'Contenido sexual o explícito', hateful: 'Contenido de odio o discriminatorio',
      harassment: 'Contenido de acoso o amenazas', misleading_identity: 'Identidad engañosa', inappropriate: 'Contenido de perfil inapropiado' },
  },
};
