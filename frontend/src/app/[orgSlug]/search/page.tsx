"use client";

import { Badge, Card, PageHeader } from "@/components/ui/shared";
import { useOrgPolicies } from "@/hooks/use-policies";
import { api } from "@/lib/api";
import {
  formatRelative,
  priorityColor,
  statusColor,
  statusLabel,
} from "@/lib/utils";
import { useAuthStore } from "@/stores/auth-store";
import type { Project, Task } from "@/types/domain";
import { useQuery } from "@tanstack/react-query";
import { FolderKanban, ListTodo, Search as SearchIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

const SEARCH_LIMIT = 25;

export default function SearchPage() {
  const currentOrg = useAuthStore((s) => s.currentOrg);
  const router = useRouter();
  const orgSlug = currentOrg?.slug || "";
  const policies = useOrgPolicies();
  const [query, setQuery] = useState("");
  const [searchTerm, setSearchTerm] = useState("");

  // Debounce: auto-search after 300ms of inactivity
  useEffect(() => {
    if (query.trim().length < 2) return;
    const timer = setTimeout(() => {
      setSearchTerm(query.trim());
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  const { data: taskResults, isFetching: tasksFetching } = useQuery({
    queryKey: ["search-tasks", currentOrg?.id, searchTerm],
    queryFn: () => api.search.tasks(currentOrg!.id, searchTerm, SEARCH_LIMIT),
    enabled: !!currentOrg && searchTerm.length >= 2,
  });

  const { data: projectResults, isFetching: projectsFetching } = useQuery({
    queryKey: ["search-projects", currentOrg?.id, searchTerm],
    queryFn: () =>
      api.search.projects(currentOrg!.id, searchTerm, SEARCH_LIMIT),
    enabled: !!currentOrg && searchTerm.length >= 2,
  });

  // Build a project name lookup from search results + any project data available
  const { data: allProjects } = useQuery({
    queryKey: ["projects", currentOrg?.id, policies.canViewAllProjects],
    queryFn: () =>
      api.projects.list(currentOrg!.id, policies.projectListParams()),
    enabled: !!currentOrg && !policies.isLoading,
    staleTime: 5 * 60_000,
  });

  const projectNameMap = new Map<string, string>();
  for (const p of allProjects?.data || []) {
    projectNameMap.set(p.id, p.name);
  }
  for (const p of projectResults?.data || []) {
    projectNameMap.set(p.id, p.name);
  }

  const isFetching = tasksFetching || projectsFetching;

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim().length >= 2) {
      setSearchTerm(query.trim());
    }
  };

  const tasks = taskResults?.data || [];
  const projects = projectResults?.data || [];
  const totalResults = (taskResults?.total || 0) + (projectResults?.total || 0);

  return (
    <div>
      <PageHeader title="Search" description="Find tasks and projects" />

      <form onSubmit={handleSearch} className="mb-6">
        <div className="join w-full max-w-lg">
          <input
            className="input input-bordered join-item flex-1"
            placeholder="Search tasks and projects..."
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

      {!searchTerm && !isFetching && (
        <div className="text-center py-16">
          <SearchIcon className="w-16 h-16 text-base-content/15 mx-auto mb-4" />
          <p className="text-lg font-medium text-base-content/40">
            Search across your workspace
          </p>
          <p className="text-sm text-base-content/30 mt-1">
            Find tasks and projects by name, description, or ID
          </p>
        </div>
      )}

      {searchTerm && !isFetching && (
        <div>
          <p className="text-sm text-base-content/50 mb-4">
            {totalResults} result{totalResults !== 1 ? "s" : ""} for &quot;
            {searchTerm}&quot;
            {(tasks.length >= SEARCH_LIMIT ||
              projects.length >= SEARCH_LIMIT) && (
              <span className="ml-1">
                (showing first {SEARCH_LIMIT} per category)
              </span>
            )}
          </p>

          {totalResults === 0 ? (
            <div className="text-center py-12">
              <ListTodo className="w-16 h-16 text-base-content/20 mx-auto mb-4" />
              <p className="text-base-content/50">No results found</p>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Project results */}
              {projects.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-base-content/70 mb-2 flex items-center gap-2">
                    <FolderKanban className="w-4 h-4" /> Projects (
                    {projects.length})
                  </h3>
                  <Card>
                    <div className="overflow-x-auto">
                      <table className="table">
                        <thead>
                          <tr>
                            <th>Name</th>
                            <th>Status</th>
                            <th>Created</th>
                          </tr>
                        </thead>
                        <tbody>
                          {projects.map((project: Project) => (
                            <tr
                              key={project.id}
                              className="hover cursor-pointer"
                              onClick={() =>
                                router.push(
                                  `/${orgSlug}/projects/${project.id}`,
                                )
                              }
                            >
                              <td className="font-medium">{project.name}</td>
                              <td>
                                <Badge variant={statusColor(project.status)}>
                                  {statusLabel(project.status)}
                                </Badge>
                              </td>
                              <td className="text-sm text-base-content/60">
                                {formatRelative(project.created_at)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </Card>
                </div>
              )}

              {/* Task results */}
              {tasks.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-base-content/70 mb-2 flex items-center gap-2">
                    <ListTodo className="w-4 h-4" /> Tasks ({tasks.length})
                  </h3>
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
                          {tasks.map((task: Task) => (
                            <tr
                              key={task.id}
                              className="hover cursor-pointer"
                              onClick={() =>
                                router.push(
                                  `/${orgSlug}/projects/${task.project_id}?task=${task.id}`,
                                )
                              }
                            >
                              <td className="font-medium">{task.title}</td>
                              <td>
                                <Badge variant={statusColor(task.status)}>
                                  {statusLabel(task.status)}
                                </Badge>
                              </td>
                              <td>
                                <Badge variant={priorityColor(task.priority)}>
                                  {statusLabel(task.priority)}
                                </Badge>
                              </td>
                              <td className="text-sm text-base-content/60">
                                {projectNameMap.get(task.project_id) ||
                                  task.project_id.slice(0, 8)}
                              </td>
                              <td className="text-sm text-base-content/60">
                                {formatRelative(task.created_at)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </Card>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
