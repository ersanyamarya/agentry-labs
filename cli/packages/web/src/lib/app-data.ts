// What every screen reads: the folder agentry ui runs in (`info`) and everything about it (`load`). Writes refetch `load`.

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { orpc } from "./orpc.js";

export const useAppData = () => {
  const info = useQuery(orpc.info.queryOptions());
  const dir = info.data?.dir ?? "";
  const load = useQuery({
    ...orpc.load.queryOptions({ input: { dir } }),
    enabled: dir !== "",
  });
  return {
    dir,
    version: info.data?.version,
    data: load.data,
    error: info.error ? info.error : load.error,
    loading: info.data === undefined || load.data === undefined,
  };
};

export const useReload = () => {
  const client = useQueryClient();
  return () => client.invalidateQueries({ queryKey: orpc.load.key() });
};
