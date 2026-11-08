/**
 * Runs the portrait models (person segmentation, then face landmarks with a second pass on likely
 * small faces, then the first face's regions). Shared by the worker and the main-thread fallback.
 */
import { ModelsMissingError, detectFacesThorough, regionsForFace, segmentPerson, type PersonSegmentation } from './mediapipe';
import type { FaceRegions, Landmark } from './faceMask';

export interface PortraitModelResult {
  faces: Landmark[][];
  /** Regions of the first face, when there is one. */
  regions: FaceRegions | null;
  segmentation: PersonSegmentation | null;
  segError: string;
}

export async function runPortraitModels(input: ImageBitmap): Promise<PortraitModelResult> {
  let segmentation: PersonSegmentation | null = null;
  let segError = '';
  try {
    segmentation = await segmentPerson(input);
  } catch (e) {
    if (e instanceof ModelsMissingError) throw e;
    segError = 'Subject segmentation failed on this device.';
  }
  const faces = await detectFacesThorough(input, segmentation);
  const regions = faces.length ? await regionsForFace(faces[0]) : null;
  return { faces, regions, segmentation, segError };
}
