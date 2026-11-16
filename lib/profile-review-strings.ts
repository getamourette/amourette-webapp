import type { Locale } from './strings';
import type { ReviewTextReason } from './profile-review';

type ReviewStrings = {
  submit: string; error: string; retry: string;
  saveName: string; saveBio: string; fieldSaved: string; legacyPhotoReason: string;
  reasons: Record<ReviewTextReason, string>;
};

export const profileReviewStrings: Record<Locale, ReviewStrings> = {
  en: {
    submit: 'Submit for review',
    error: 'Could not confirm your profile review. Refresh before trying again.', retry: 'Refresh',
    saveName: 'Save name changes', saveBio: 'Save bio changes', fieldSaved: 'Changes saved. Submit your profile when all requested fields are updated.',
    legacyPhotoReason: 'Please choose a new profile picture. The original correction reason is unavailable.',
    reasons: {
      sexual: 'Remove explicit sexual content.', hateful: 'Remove hateful content.',
      harassment: 'Remove content that targets or harasses someone.',
      misleading_identity: 'Use content that represents you accurately.',
      inappropriate: 'Use appropriate content for your profile.',
    },
  },
  fr: {
    submit: 'Envoyer pour validation',
    error: 'Impossible de confirmer la vérification de ton profil. Actualise avant de réessayer.', retry: 'Actualiser',
    saveName: 'Enregistrer le prénom', saveBio: 'Enregistrer la bio', fieldSaved: 'Modifications enregistrées. Envoie ton profil quand tous les éléments demandés sont à jour.',
    legacyPhotoReason: 'Choisis une nouvelle photo de profil. Le motif initial de la demande n’est plus disponible.',
    reasons: {
      sexual: 'Retire le contenu sexuel explicite.', hateful: 'Retire le contenu haineux.',
      harassment: 'Retire le contenu qui vise ou harcèle quelqu’un.',
      misleading_identity: 'Utilise du contenu qui te représente fidèlement.',
      inappropriate: 'Utilise du contenu adapté à ton profil.',
    },
  },
  es: {
    submit: 'Enviar para revisión',
    error: 'No se pudo confirmar la revisión de tu perfil. Actualiza antes de intentarlo de nuevo.', retry: 'Actualizar',
    saveName: 'Guardar el nombre', saveBio: 'Guardar la bio', fieldSaved: 'Cambios guardados. Envía tu perfil cuando hayas actualizado todos los campos solicitados.',
    legacyPhotoReason: 'Elige una nueva foto de perfil. El motivo original de la solicitud no está disponible.',
    reasons: {
      sexual: 'Elimina el contenido sexual explícito.', hateful: 'Elimina el contenido de odio.',
      harassment: 'Elimina el contenido que ataque o acose a alguien.',
      misleading_identity: 'Usa contenido que te represente con exactitud.',
      inappropriate: 'Usa contenido adecuado para tu perfil.',
    },
  },
};
