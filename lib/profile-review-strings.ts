import type { Locale } from './strings';
import type { ReviewField, ReviewTextReason } from './profile-review';

type ReviewStrings = {
  title: string; pendingTitle: string; hidden: string; pending: string;
  notification: string; acknowledge: string; updated: string; remaining: string;
  ready: string; submit: string; submitting: string; error: string; retry: string;
  saveName: string; saveBio: string; fieldSaved: string; legacyPhotoReason: string;
  fields: Record<ReviewField, string>; edit: Record<ReviewField, string>;
  reasons: Record<ReviewTextReason, string>;
};

export const profileReviewStrings: Record<Locale, ReviewStrings> = {
  en: {
    title: 'Update your profile', pendingTitle: 'Your changes are waiting for review',
    hidden: 'Your profile is hidden until approved. You can still edit your profile and use your existing chats.',
    pending: 'We’ll review your submitted changes. Your profile stays hidden until approved.',
    notification: 'We need a few changes to your profile.', acknowledge: 'Got it',
    updated: 'Updated', remaining: 'Update every requested field before submitting.',
    ready: 'All requested fields are updated. You can submit your profile for review.',
    submit: 'Submit for review', submitting: 'Submitting…',
    error: 'Could not confirm your profile review. Refresh before trying again.', retry: 'Refresh',
    saveName: 'Save name changes', saveBio: 'Save bio changes', fieldSaved: 'Changes saved. Submit your profile when all requested fields are updated.',
    legacyPhotoReason: 'Please choose a new profile picture. The original correction reason is unavailable.',
    fields: { first_name: 'Name', bio: 'Bio', photo: 'Profile picture' },
    edit: { first_name: 'Edit name', bio: 'Edit bio', photo: 'Change picture' },
    reasons: {
      sexual: 'Remove explicit sexual content.', hateful: 'Remove hateful content.',
      harassment: 'Remove content that targets or harasses someone.',
      misleading_identity: 'Use content that represents you accurately.',
      inappropriate: 'Use appropriate content for your profile.',
    },
  },
  fr: {
    title: 'Mets à jour ton profil', pendingTitle: 'Tes modifications attendent une vérification',
    hidden: 'Ton profil est masqué jusqu’à sa validation. Tu peux toujours le modifier et utiliser tes conversations existantes.',
    pending: 'Nous allons vérifier tes modifications. Ton profil reste masqué jusqu’à sa validation.',
    notification: 'Quelques modifications sont nécessaires sur ton profil.', acknowledge: 'Compris',
    updated: 'Mis à jour', remaining: 'Modifie chaque élément demandé avant d’envoyer ton profil.',
    ready: 'Tous les éléments demandés sont à jour. Tu peux envoyer ton profil pour vérification.',
    submit: 'Envoyer pour vérification', submitting: 'Envoi en cours…',
    error: 'Impossible de confirmer la vérification de ton profil. Actualise avant de réessayer.', retry: 'Actualiser',
    saveName: 'Enregistrer le prénom', saveBio: 'Enregistrer la bio', fieldSaved: 'Modifications enregistrées. Envoie ton profil quand tous les éléments demandés sont à jour.',
    legacyPhotoReason: 'Choisis une nouvelle photo de profil. Le motif initial de la demande n’est plus disponible.',
    fields: { first_name: 'Prénom', bio: 'Bio', photo: 'Photo de profil' },
    edit: { first_name: 'Modifier le prénom', bio: 'Modifier la bio', photo: 'Changer la photo' },
    reasons: {
      sexual: 'Retire le contenu sexuel explicite.', hateful: 'Retire le contenu haineux.',
      harassment: 'Retire le contenu qui vise ou harcèle quelqu’un.',
      misleading_identity: 'Utilise du contenu qui te représente fidèlement.',
      inappropriate: 'Utilise du contenu adapté à ton profil.',
    },
  },
  es: {
    title: 'Actualiza tu perfil', pendingTitle: 'Tus cambios están pendientes de revisión',
    hidden: 'Tu perfil está oculto hasta que se apruebe. Puedes seguir editándolo y usar tus conversaciones existentes.',
    pending: 'Revisaremos los cambios que has enviado. Tu perfil sigue oculto hasta que se apruebe.',
    notification: 'Tu perfil necesita algunos cambios.', acknowledge: 'Entendido',
    updated: 'Actualizado', remaining: 'Actualiza todos los campos solicitados antes de enviar tu perfil.',
    ready: 'Todos los campos solicitados están actualizados. Ya puedes enviar tu perfil para revisión.',
    submit: 'Enviar para revisión', submitting: 'Enviando…',
    error: 'No se pudo confirmar la revisión de tu perfil. Actualiza antes de intentarlo de nuevo.', retry: 'Actualizar',
    saveName: 'Guardar el nombre', saveBio: 'Guardar la bio', fieldSaved: 'Cambios guardados. Envía tu perfil cuando hayas actualizado todos los campos solicitados.',
    legacyPhotoReason: 'Elige una nueva foto de perfil. El motivo original de la solicitud no está disponible.',
    fields: { first_name: 'Nombre', bio: 'Bio', photo: 'Foto de perfil' },
    edit: { first_name: 'Editar nombre', bio: 'Editar bio', photo: 'Cambiar foto' },
    reasons: {
      sexual: 'Elimina el contenido sexual explícito.', hateful: 'Elimina el contenido de odio.',
      harassment: 'Elimina el contenido que ataque o acose a alguien.',
      misleading_identity: 'Usa contenido que te represente con exactitud.',
      inappropriate: 'Usa contenido adecuado para tu perfil.',
    },
  },
};
