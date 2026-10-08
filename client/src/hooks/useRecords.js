"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";

export function useRecordsQuery(params) {
  return useQuery({
    queryKey: ["records", params],
    queryFn: () => api.get("/records", params),
    enabled: params !== null,
    placeholderData: (prev) => prev,
  });
}

export function useDashboardConfig(username) {
  return useQuery({ queryKey: ["dashboard-config", username], queryFn: () => api.get("/records/dashboard-config") });
}

export function useMasterLists() {
  return useQuery({ queryKey: ["projects"], queryFn: () => api.get("/projects") });
}

function useInvalidating(mutationFn) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["records"] });
      qc.invalidateQueries({ queryKey: ["projects"] });
      qc.invalidateQueries({ queryKey: ["project-detail"] });
    },
  });
}

export const useAddRecord = () => useInvalidating((body) => api.post("/records", body));
export const useUpdateRecord = () => useInvalidating(({ id, body }) => api.put(`/records/${id}`, body));
export const useDeleteRecord = () => useInvalidating(({ id }) => api.delete(`/records/${id}`));

/** Toggle Invoice Released (server only allows admin / Settings-listed users). */
export const useInvoiceReleased = () =>
  useInvoicing(({ id, value }) => api.post(`/records/${id}/invoice-released`, { value }));

function useInvoicing(mutationFn) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["records"] });
      qc.invalidateQueries({ queryKey: ["project-detail"] });
      qc.invalidateQueries({ queryKey: ["completed-log"] });
    },
  });
}
