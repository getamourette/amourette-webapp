import type { Locale } from './strings';
import type { ReviewField } from './profile-review';

type CorrectionStrings = {
  reviewed: string; rejected: string; notice: string; modify: string; compactCopy: string; close: string;
  language: string; status: string; titles: Record<ReviewField, string>; one: string; why: string;
  labels: Record<ReviewField, string>; save: Record<ReviewField, string>; next: string; hint: string;
  saved: string; savedMany: string; ready: string; readyCopy: string; readyMany: string; submit: string;
  readyHint: string; edit: string; waiting: string; sentTitle: string; sentCopy: string; received: (count: number) => string;
  access: string; step: (index: number, count: number) => string; back: string; choose: string;
  newPhoto: string; photoSaved: string; emptyBio: string; account: string; return: string;
  saving: string; error: string; retry: string; loading: string; continue: string; summary: string; viewStatus: string;
};

export const correctionStrings: Record<Locale, CorrectionStrings> = {
  en: {
    reviewed: 'After reviewing your profile', rejected: 'Your profile needs a few changes', notice: 'Update the following before we can approve your profile.', modify: 'Edit my profile', compactCopy: 'Update the requested fields, then send your profile for review.', close: 'Close',
    language: 'Language', status: 'Profile not yet approved',
    titles: { first_name: 'Let’s update your first name', bio: 'A little update to your bio', photo: 'Let’s choose a new photo' },
    one: 'Just this one change is needed.', why: 'Why we’re asking',
    labels: { first_name: 'First name', bio: 'Bio', photo: 'Profile photo' },
    save: { first_name: 'Save first name', bio: 'Save bio', photo: 'Save photo' }, next: 'Save & continue',
    hint: 'You’ll send your profile for review next.', saved: 'Change saved', savedMany: 'Changes saved',
    ready: 'Ready to send', readyCopy: 'Your change is saved but has not been submitted. Send your profile so our team can review it.',
    readyMany: 'Your changes are saved but have not been submitted. Send your profile so our team can review them.',
    submit: 'Send for review', readyHint: 'Your profile stays hidden until it’s approved.', edit: 'Edit', waiting: 'Awaiting approval',
    sentTitle: 'Thanks, we’ve got it.', sentCopy: 'Your updated profile is with our team for review.', received: n => n === 1 ? 'Your change was sent successfully.' : 'Your changes were sent successfully.',
    access: 'Your profile stays hidden until approval. Your account and existing chats remain available.',
    step: (i, n) => `${i} of ${n}`, back: 'Previous change', choose: 'Choose a photo', newPhoto: 'New photo',
    photoSaved: 'New photo saved', emptyBio: 'Bio removed', account: 'Account settings', return: 'Back',
    saving: 'Sending…', error: 'Could not submit your changes. Your edits are still here. Try again.', retry: 'Try again',
    loading: 'Loading your saved changes…', continue: 'Continue corrections', summary: 'Review saved changes', viewStatus: 'View review status',
  },
  fr: {
    reviewed: 'Après examen de ton profil', rejected: 'Ton profil n’a pas été accepté', notice: 'Ces éléments sont à modifier avant sa validation.', modify: 'Modifier mon profil', compactCopy: 'Corrige les éléments demandés, puis envoie ton profil pour validation.', close: 'Fermer',
    language: 'Langue', status: 'Profil pas encore approuvé',
    titles: { first_name: 'On ajuste ton prénom ?', bio: 'Une petite retouche à ta bio', photo: 'On change ta photo ?' },
    one: 'Seule cette modification est nécessaire.', why: 'Pourquoi ce changement',
    labels: { first_name: 'Prénom', bio: 'Bio', photo: 'Photo de profil' },
    save: { first_name: 'Enregistrer le prénom', bio: 'Enregistrer la bio', photo: 'Enregistrer la photo' }, next: 'Enregistrer et continuer',
    hint: 'Tu pourras ensuite envoyer ton profil en vérification.', saved: 'Modification enregistrée', savedMany: 'Modifications enregistrées',
    ready: 'Prêt à envoyer', readyCopy: 'Ta modification est enregistrée, mais pas encore envoyée. Envoie ton profil pour que notre équipe le vérifie.',
    readyMany: 'Tes modifications sont enregistrées, mais pas encore envoyées. Envoie ton profil pour que notre équipe les vérifie.',
    submit: 'Envoyer pour validation', readyHint: 'Ton profil reste masqué jusqu’à sa validation.', edit: 'Modifier', waiting: 'En attente de validation',
    sentTitle: 'Merci, c’est bien reçu.', sentCopy: 'Ton profil modifié est entre les mains de notre équipe pour vérification.', received: n => n === 1 ? 'Ta modification a bien été envoyée.' : 'Tes modifications ont bien été envoyées.',
    access: 'Ton profil reste masqué jusqu’à sa validation. Ton compte et tes conversations restent accessibles.',
    step: (i, n) => `${i} sur ${n}`, back: 'Modification précédente', choose: 'Choisir une photo', newPhoto: 'Nouvelle photo',
    photoSaved: 'Nouvelle photo enregistrée', emptyBio: 'Bio supprimée', account: 'Paramètres du compte', return: 'Retour',
    saving: 'Envoi en cours…', error: 'Impossible d’envoyer tes modifications. Ta saisie est conservée. Réessaie.', retry: 'Réessayer',
    loading: 'Chargement de tes modifications enregistrées…', continue: 'Continuer les modifications', summary: 'Voir les modifications enregistrées', viewStatus: 'Voir le statut de vérification',
  },
  es: {
    reviewed: 'Después de revisar tu perfil', rejected: 'Tu perfil necesita algunos cambios', notice: 'Actualiza estos campos antes de que podamos aprobar tu perfil.', modify: 'Modificar mi perfil', compactCopy: 'Actualiza los campos solicitados y envía tu perfil para revisión.', close: 'Cerrar',
    language: 'Idioma', status: 'Perfil aún sin aprobar',
    titles: { first_name: 'Vamos a ajustar tu nombre', bio: 'Un pequeño cambio en tu biografía', photo: 'Vamos a elegir otra foto' },
    one: 'Solo necesitas hacer este cambio.', why: 'Por qué te lo pedimos',
    labels: { first_name: 'Nombre', bio: 'Biografía', photo: 'Foto de perfil' },
    save: { first_name: 'Guardar nombre', bio: 'Guardar biografía', photo: 'Guardar foto' }, next: 'Guardar y continuar',
    hint: 'Después podrás enviar tu perfil para revisión.', saved: 'Cambio guardado', savedMany: 'Cambios guardados',
    ready: 'Listo para enviar', readyCopy: 'Tu cambio está guardado, pero aún no se ha enviado. Envía tu perfil para que nuestro equipo lo revise.',
    readyMany: 'Tus cambios están guardados, pero aún no se han enviado. Envía tu perfil para que nuestro equipo los revise.',
    submit: 'Enviar para revisión', readyHint: 'Tu perfil seguirá oculto hasta su aprobación.', edit: 'Editar', waiting: 'Pendiente de aprobación',
    sentTitle: 'Gracias, lo hemos recibido.', sentCopy: 'Nuestro equipo ha recibido tu perfil actualizado para revisarlo.', received: n => n === 1 ? 'Tu cambio se ha enviado correctamente.' : 'Tus cambios se han enviado correctamente.',
    access: 'Tu perfil seguirá oculto hasta su aprobación. Tu cuenta y tus conversaciones siguen disponibles.',
    step: (i, n) => `${i} de ${n}`, back: 'Cambio anterior', choose: 'Elegir una foto', newPhoto: 'Nueva foto',
    photoSaved: 'Nueva foto guardada', emptyBio: 'Biografía eliminada', account: 'Configuración de la cuenta', return: 'Volver',
    saving: 'Enviando…', error: 'No se pudieron enviar los cambios. Tus cambios siguen aquí. Inténtalo de nuevo.', retry: 'Reintentar',
    loading: 'Cargando tus cambios guardados…', continue: 'Continuar los cambios', summary: 'Ver los cambios guardados', viewStatus: 'Ver el estado de revisión',
  },
};
