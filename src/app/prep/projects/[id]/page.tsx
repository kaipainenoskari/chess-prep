"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import type { OpeningRepertoire as OpeningRepertoireType } from "@/lib/types";
import OpeningRepertoireComponent from "@/components/opening-repertoire";

interface PrepProjectData {
  id: string;
  opponentUsername: string;
  color: string;
  ratingBucket: string;
  status: string;
  timeClass: string | null;
  createdAt: string;
  updatedAt: string;
}

export default function PrepProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const [projectId, setProjectId] = useState<string | null>(null);
  const [project, setProject] = useState<PrepProjectData | null>(null);
  const [openings, setOpenings] = useState<OpeningRepertoireType | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchProject = useCallback(async (id: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/prep/projects/${id}`);
      if (!res.ok) {
        if (res.status === 404) throw new Error("Project not found");
        throw new Error("Failed to load project");
      }
      const data = (await res.json()) as {
        project: PrepProjectData;
        openings: OpeningRepertoireType;
      };
      setProject(data.project);
      setProjectId(data.project.id);
      setOpenings(data.openings);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    params.then(({ id }) => {
      if (!cancelled) fetchProject(id);
    });
    return () => {
      cancelled = true;
    };
  }, [params, fetchProject]);

  const refetch = useCallback(() => {
    if (projectId) fetchProject(projectId);
  }, [projectId, fetchProject]);

  if (loading && !project) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-12 text-center text-gray-400">
        Loading project…
      </div>
    );
  }

  if (error && !project) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-12 text-center">
        <p className="text-red-400 mb-4">{error}</p>
        <Link href="/prep" className="text-chess-accent hover:underline">
          Back to prep projects
        </Link>
      </div>
    );
  }

  if (!project || !openings) return null;

  const root = project.color === "black" ? openings.asWhite : openings.asBlack;
  const repertoireForPrep: OpeningRepertoireType = {
    asWhite: root,
    asBlack: root,
  };
  const initialTab = project.color === "black" ? "white" : "black";

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <div className="mb-6 flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold">
            Prep vs <span className="text-chess-accent">{project.opponentUsername}</span>
          </h1>
          <p className="text-sm text-gray-400 mt-0.5">
            As {project.color === "white" ? "White" : "Black"} · {project.ratingBucket}
          </p>
        </div>
        <Link
          href="/prep"
          className="text-sm text-gray-400 hover:text-chess-accent transition-colors"
        >
          ← All projects
        </Link>
      </div>

      <OpeningRepertoireComponent
        openings={repertoireForPrep}
        projectId={project.id}
        onRefetchProject={refetch}
        initialTab={initialTab}
        hideColorTabs
      />
    </div>
  );
}
