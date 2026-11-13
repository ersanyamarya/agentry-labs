// Small display helpers shared by screens.

export const formatBytes = (bytes: number) => {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  return bytes < 1024 * 1024
    ? `${(bytes / 1024).toFixed(1)} KB`
    : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
};

export const formatAge = (days: number) => {
  if (days < 1) {
    return "today";
  }
  return days === 1 ? "1 day" : `${Math.floor(days)} days`;
};

// Until `load` answers a screen would read "0 rows" or "no problems"; say it is loading instead.
export const whileLoading = (loading: boolean, text: string) =>
  loading ? "Loading..." : text;
