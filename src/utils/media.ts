import heroWorldImg from '../assets/images/hero_world_travel_1794551011751.jpg';
import tokyoImg from '../assets/images/dest_tokyo_twilight_1794551011664.jpg';
import swissImg from '../assets/images/dest_swiss_alps_1794551011995.jpg';
import goaImg from '../assets/images/dest_goa_coast_1794551010953.jpg';
import parisImg from '../assets/images/dest_paris_europe_1794551013602.jpg';

export const DESTINATION_IMAGES: Record<'hero' | 'tokyo' | 'swiss' | 'goa' | 'paris', string> = {
  hero: heroWorldImg,
  tokyo: tokyoImg,
  swiss: swissImg,
  goa: goaImg,
  paris: parisImg,
};

export function getDestinationImage(key?: 'hero' | 'tokyo' | 'swiss' | 'goa' | 'paris'): string {
  if (!key) return heroWorldImg;
  return DESTINATION_IMAGES[key] || heroWorldImg;
}
