"use client";

import { api } from "@/lib/api";
import { useAuthStore } from "@/stores/auth-store";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

/**
 * useReviewableFields — returns the list of reviewable field names for a project
 * and helpers to check if a given task field is editable or requires review.
 */
export function useReviewableFields(projectId: string | undefined) {
  const currentOrg = useAuthStore((s) => s.currentOrg);

  const { data: project } = useQuery({
    queryKey: ["project", currentOrg?.id, projectId],
    queryFn: () => api.projects.get(currentOrg!.id, projectId!),
    enabled: !!currentOrg && !!projectId,
    staleTime: 30_000,
  });

  return useMemo(() => {
    const reviewableFields: string[] =
      (project?.settings?.reviewable_fields as string[]) || [];

    /** True if this project has any fields that require review */
    const hasReviewPipeline = reviewableFields.length > 0;

    /** Check if a specific task field requires review */
    const isReviewable = (field: string): boolean =>
      reviewableFields.includes(field);

    return { reviewableFields, hasReviewPipeline, isReviewable };
  }, [project?.settings?.reviewable_fields]);
}
