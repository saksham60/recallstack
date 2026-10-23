"use client";
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api/client";
import { getApiErrorMessage } from "@/lib/api/errors";
import { buttonClass, inputClass } from "../components/AdminPrimitives";

type Classification = "internal" | "judge" | "demo" | "test";
export function AccountClassification({
  userId,
  current,
  available,
}: {
  userId: string;
  current: string;
  available: boolean;
}) {
  const [value, setValue] = useState(current === "Unknown" ? "" : current);
  const client = useQueryClient();
  const save = useMutation({
    mutationFn: async () => {
      await apiClient.PUT(
        "/api/v1/admin/analytics/users/{user_id}/classification",
        {
          params: { path: { user_id: userId } },
          body: {
            classification: value ? (value as Classification) : null,
            reason: "admin_verified",
          },
        },
      );
    },
    onSuccess: () => client.invalidateQueries({ queryKey: ["admin"] }),
  });
  if (!available) return null;
  return (
    <section className="space-y-3 rounded-lg border border-border bg-surface p-4">
      <h2 className="font-semibold">Account classification</h2>
      <p className="text-sm text-muted">
        Set this only after verifying the account. Unclassified accounts remain
        included in organic metrics. Classification does not grant roles.
      </p>
      <div className="flex flex-wrap gap-3">
        <label className="text-xs text-muted">
          Verified classification
          <select
            className={`${inputClass} mt-1`}
            value={value}
            onChange={(e) => setValue(e.target.value)}
          >
            <option value="">Unclassified</option>
            {["internal", "judge", "demo", "test"].map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <button
          className={`${buttonClass} self-end`}
          disabled={save.isPending}
          onClick={() => save.mutate()}
        >
          Save classification
        </button>
      </div>
      {save.error && (
        <p role="alert" className="text-sm text-danger">
          {getApiErrorMessage(save.error)}
        </p>
      )}
      {save.isSuccess && (
        <p role="status" className="text-sm text-muted">
          Classification saved.
        </p>
      )}
    </section>
  );
}
