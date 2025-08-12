export interface HouseData {
  houseNumber: number;
  cuspDegree: number;
  cuspSign: string;
  cuspDegreeInSign: number;
  cuspMinutes: number;
}

export interface AngleData {
  degree: number;
  sign: string;
  degreeInSign: number;
  minutes: number;
}

export interface PlanetData {
  name: string;
  longitude: number;
  sign: string;
  degreeInSign: number;
  minutes: number;
  house: number;
}

export interface ChartData {
  planets: Record<string, Omit<PlanetData, 'name'>>;
  houses: HouseData[];
  ascendant: AngleData;
  midheaven: AngleData;
}

export interface NatalChartEvent {
  userId: string;
  birthDate: string; // YYYY-MM-DD
  birthTime?: string; // HH:MM
  latitude: number;
  longitude: number;
  ianaTimeZone: string;
}
