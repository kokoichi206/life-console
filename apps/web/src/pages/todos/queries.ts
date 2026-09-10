import { queryOptions, useMutation, useQueryClient } from "@tanstack/react-query";

import { api } from "../../api";

export const shoppingQuery = queryOptions({ queryKey: ["shopping"], queryFn: api.shopping });

export const useShoppingMutation = <T>(mutationFn: (input: T) => Promise<null>, onSaved?: () => void) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: ["shopping"], mutationFn,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["shopping"] });
      onSaved?.();
    },
  });
};
