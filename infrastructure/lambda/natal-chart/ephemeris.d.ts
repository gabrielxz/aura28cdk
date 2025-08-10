declare module 'ephemeris' {
  export function getAllPlanets(
    date: Date,
    longitude: number,
    latitude: number,
    timezoneOffset: number,
  ): any;
}