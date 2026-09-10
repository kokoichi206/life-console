import { queryOptions, useMutation, useQueryClient } from "@tanstack/react-query";

import { api } from "../../api";

export const shoppingQuery = queryOptions({ queryKey: ["shopping"], queryFn: api.shopping });

export const useShoppingMutation = <T>(mutationFn: (input: T) => Promise<null>, onSaved?: (input: T) => void) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: ["shopping"], mutationFn,
    onSuccess: async (_result, input) => {
      await queryClient.invalidateQueries({ queryKey: ["shopping"] });
      onSaved?.(input);
    },
  });
};
