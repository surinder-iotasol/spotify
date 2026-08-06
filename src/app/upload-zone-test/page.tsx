/**
 * STORY-track-006b: Render-only page for E2E testing of DragAndDropUploadZone.
 *
 * No authentication required — just renders the upload zone component.
 */
'use client';

import { useState } from 'react';
import { DragAndDropUploadZone } from '@/components/file-upload/DragAndDropUploadZone';

export default function UploadZoneTestPage() {
  const [files, setFiles] = useState<File[]>([]);
  const [errors, setErrors] = useState<string[]>([]);

  return (
    <main className="max-w-4xl mx-auto py-12 px-4">
      <h1 className="text-2xl font-bold mb-6">Upload Zone Test (E2E)</h1>
      <DragAndDropUploadZone
        files={files}
        errors={errors}
        setFiles={setFiles}
        setErrors={setErrors}
      />
      {/* Debug area for E2E assertions */}
      <div className="mt-6">
        <h2 className="text-lg font-semibold mb-2">Accepted files ({files.length})</h2>
        <ul>
          {files.map((f, i) => (
            <li key={i}>{f.name}</li>
          ))}
        </ul>
      </div>
      <div className="mt-4">
        <h2 className="text-lg font-semibold mb-2">Errors ({errors.length})</h2>
        <ul>
          {errors.map((e, i) => (
            <li key={i} className="text-red-500">{e}</li>
          ))}
        </ul>
      </div>
    </main>
  );
}
