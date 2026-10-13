import ProfileForm from './ProfileForm';

function first(value: string | string[] | undefined) {
  return (Array.isArray(value) ? value[0] : value) ?? null;
}

export default async function ProfilePage({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // Resolve the entry for this request rather than reusing a static onboarding
  // route when the participant navigates back for moderator corrections.
  const params = await searchParams;
  const requestedVenueSlug = first(params.venue);
  const requestedEditMode = first(params.edit) === '1';
  const requestedCorrection = first(params.correction);
  return <ProfileForm key={`${requestedEditMode ? 'edit' : 'create'}:${requestedVenueSlug ?? ''}`}
    requestedVenueSlug={requestedVenueSlug} requestedEditMode={requestedEditMode} requestedCorrection={requestedCorrection} />;
}
