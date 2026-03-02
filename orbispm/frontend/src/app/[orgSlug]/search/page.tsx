"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/stores/auth-store";
import { api } from "@/lib/api";
import { PageHeader, Card, Badge } from "@/components/ui/shared";
import { statusColor, priorityColor, statusLabel, formatRelative } from "@/lib/utils";
import { Search as SearchIcon, ListTodo } from "lucide-react";
import type { Task } from "@/types/domain";

export default function SearchPage() {
  const currentOrg = useAuthStore((s) => s.currentOrg);
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [searchTerm, setSearchTerm] = useState("");

  const { data: results, isFetching } = useQuery({
    queryKey: ["search", currentOrg?.id, searchTerm],
    queryFn: () => api.search.tasks(currentOrg!.id, searchTerm),
    enabled: !!currentOrg && searchTerm.length >= 2,
  });

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim().length >= 2) {
      setSearchTerm(query.trim());
    }
  };

  return (
    <div>
      <PageHeader title="Search" description="Find tasks across all projects" />

      <form onSubmit={handleSearch} className="mb-6">
        <div className="join w-full max-w-lg">
          <input
            className="input input-bordered join-item flex-1"
            placeholder="Search tasks..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <button className="btn btn-primary join-item" type="submit">
            <SearchIcon className="w-4 h-4" />
            Search
          </button>
        </div>
      </form>

      {isFetching && (
        <div className="flex items-center gap-2 mb-4">
          <span className="loading loading-spinner loading-sm" />
          <span className="text-sm text-base-content/50">Searching...</span>
        </div>
      )}

      {searchTerm && results && (
        <div>
          <p className="text-sm text-base-content/50 mb-4">
            {results.total} result{results.total !== 1 ? "s" : ""} for &quot;{searchTerm}&quot;
          </p>
          {results.data.length === 0 ? (
            <div className="text-center py-12">
              <ListTodo className="w-16 h-16 text-base-content/20 mx-auto mb-4" />
              <p className="text-base-content/50">No tasks found</p>
            </div>
          ) : (
            <Card>
              <div className="overflow-x-auto">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Title</th>
                      <th>Status</th>
                      <th>Priority</th>
                      <th>Project</th>
                      <th>Created</th>
                    </tr>
                  </thead>
                  <tbody>
                    {results.data.map((task: Task) => (
                      <tr
                        key={task.id}
                        className="hover cursor-pointer"
                        onClick={() =>
                          router.push(`/${currentOrg!.slug}/projects/${task.project_id}/tasks/${task.id}`)
                        }
                      >
                        <td className="font-medium">{task.title}</td>
                        <td><Badge variant={statusColor(task.status)}>{statusLabel(task.status)}</Badge></td>
                        <td><Badge variant={priorityColor(task.priority)}>{statusLabel(task.priority)}</Badge></td>
                        <td className="font-mono text-xs text-base-content/50">{task.project_id.slice(0, 8)}</td>
                        <td className="text-sm text-base-content/60">{formatRelative(task.created_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
