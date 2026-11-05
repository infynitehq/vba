import {
  queryOptions,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query';
import { data } from './db';
import type { Cheat } from '../lib/cheat-format';
export const gamesQuery = queryOptions({
  queryKey: ['games'],
  queryFn: data.games,
});
export const gameQuery = (id: string) =>
  queryOptions({ queryKey: ['games', id], queryFn: () => data.game(id) });
export const cheatsQuery = (id: string) =>
  queryOptions({ queryKey: ['cheats', id], queryFn: () => data.cheats(id) });
export function useDataMutation<T>(mutationFn: (value: T) => Promise<unknown>) {
  const client = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: ['games'] }),
        client.invalidateQueries({ queryKey: ['cheats'] }),
      ]);
    },
  });
}

export function useToggleCheat() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: data.putCheat,
    onMutate: (cheat: Cheat) => {
      const key = cheatsQuery(cheat.gameId).queryKey;
      const previous = client.getQueryData(key);
      client.setQueryData(key, (items: Cheat[] | undefined) =>
        items?.map((item) => (item.id === cheat.id ? cheat : item)),
      );
      return { previous, key };
    },
    onError: (_error, _cheat, context) => {
      if (context) client.setQueryData(context.key, context.previous);
    },
    onSettled: (_data, _error, cheat) =>
      client.invalidateQueries({
        queryKey: cheatsQuery(cheat.gameId).queryKey,
      }),
  });
}
