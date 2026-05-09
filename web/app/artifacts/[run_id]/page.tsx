import { ArtifactCard } from "@/components/features/artifact-card";
import { EmptyState } from "@/components/features/empty-state";
import { getArtifact } from "@/lib/app/api";

export default async function ArtifactPage({ params }: { params: Promise<{ run_id: string }> }) {
  const { run_id: runId } = await params;
  const { data: artifact, error } = await getArtifact(runId);

  if (!artifact) {
    return (
      <EmptyState
        title="Artifact 不存在"
        message={error ?? `没有找到 Artifact ${runId}。`}
        backHref="/"
      />
    );
  }

  return (
    <main className="mx-auto grid w-full max-w-7xl gap-5 px-4 py-6">
      <header className="border-b pb-5">
        <p className="text-sm text-muted-foreground">Artifact / {artifact.runId}</p>
        <h1 className="mt-2 text-2xl font-semibold">{artifact.title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {artifact.skill} · {artifact.subject} · {artifact.asOf}
        </p>
      </header>
      <ArtifactCard artifact={artifact} />
    </main>
  );
}
