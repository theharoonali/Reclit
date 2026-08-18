export function getAppUrl() {
  if (process.env.DASHBOARD_URL) {
    return process.env.DASHBOARD_URL;
  }

  return "http://localhost:3001";
}

export function getApiUrl() {
  if (process.env.API_URL) {
    return process.env.API_URL;
  }

  return "http://localhost:3003";
}
