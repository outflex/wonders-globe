// A small direct sponsorship needs no third-party SDK or cookies.
// Enable this block and replace the copy and HTTPS URL before publishing.
export const sponsor = {
  enabled: false,
  title: 'Ваш следующий маршрут',
  description: 'Полезный сервис для тех, кто любит открывать мир.',
  url: '',
};

// Open-Meteo's free endpoint is for non-commercial use.
// For a monetized site, set the URL of your own caching proxy using a
// commercial weather plan. Never place a paid API key in browser code.
export const services = {
  weatherURL: 'https://api.open-meteo.com/v1/forecast',
  geocodingURL: 'https://geocoding-api.open-meteo.com/v1/search',
};
