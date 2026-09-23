import { photoService } from './photo-service';
import { photoStoragePath } from '../photo-moderation';
import { PHOTO_SOURCE_BUCKET, isPhotoCrop, roundCropInSource } from '../photo-upload';

export async function ownerPhotoSource(owner: string, version: string, revision: number) {
  version = version.toLowerCase();
  const service = photoService();
  const state = await service.from('photo_state').select('displayed_id,pending_id,revision,correction_required,correction_since').eq('profile_id', owner).single();
  if (state.error) throw new Error('source_unavailable');
  if (![state.data.displayed_id, state.data.pending_id].includes(version) || (version !== state.data.pending_id && state.data.correction_required && state.data.correction_since && Date.parse(state.data.correction_since) <= Date.now() - 30 * 86400000)) throw new Error('invalid_photo');
  if (state.data.revision !== revision) throw new Error('stale');
  const row = await service.from('photo_versions').select('id,path,source_path,source_width,source_height,portrait_crop,round_crop,round_source_crop').eq('id', version).eq('profile_id', owner).single();
  if (row.error) throw new Error('source_unavailable');
  const path = row.data.source_path ?? photoStoragePath(row.data.path);
  // Never fetch a user-controlled external URL with server credentials.
  if (!path) throw new Error('legacy_source_unavailable');
  const result = await service.storage.from(row.data.source_path ? PHOTO_SOURCE_BUCKET : 'profile-photos').download(path);
  if (result.error || !result.data) throw new Error('source_unavailable');
  const sourceRound = isPhotoCrop(row.data.round_source_crop) ? row.data.round_source_crop
    : isPhotoCrop(row.data.round_crop) && row.data.source_width && row.data.source_height
      ? roundCropInSource(row.data.round_crop, isPhotoCrop(row.data.portrait_crop) ? row.data.portrait_crop : undefined, row.data.source_width, row.data.source_height)
      : undefined;
  return { file: new File([result.data], 'photo', { type: result.data.type }), version: row.data, sourceRound };
}
