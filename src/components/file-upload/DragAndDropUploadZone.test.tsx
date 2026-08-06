import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { DragAndDropUploadZone } from "./DragAndDropUploadZone";

function makeFile(name: string, mimeType: string, size: number): File {
  return new File([new ArrayBuffer(Math.max(size, 1))], name, { type: mimeType });
}

describe("DragAndDropUploadZone: Rendering", () => {
  const defaultProps = {
    files: [] as File[],
    errors: [] as string[],
    setFiles: vi.fn(),
    setErrors: vi.fn(),
  };

  it("renders a visible drop zone with a styled border", () => {
    render(<DragAndDropUploadZone {...defaultProps} />);
    expect(screen.getByRole("button", { name: /Drop files here/i })).toBeInTheDocument();
  });

  it("renders a hint text inside the drop zone", () => {
    render(<DragAndDropUploadZone {...defaultProps} />);
    expect(screen.getByText(/Drag & drop/i)).toBeInTheDocument();
    expect(screen.getByText(/MP3 and WAV/i)).toBeInTheDocument();
  });

  it("renders rounded-lg border styling on the drop zone element", () => {
    const { container } = render(<DragAndDropUploadZone {...defaultProps} />);
    const dropZone = container.querySelector('[role="button"]');
    expect(dropZone?.className).toContain("rounded-lg");
  });
});

describe("DragAndDropUploadZone: Drag hover state", () => {
  it("sets drag-over when dragging over the zone (UI state)", () => {
    const { container } = render(
      <DragAndDropUploadZone
        files={[]}
        errors={[]}
        setFiles={vi.fn()}
        setErrors={vi.fn()}
      />
    );
    const dropZone = container.querySelector('[role="button"]')!;
    fireEvent.dragOver(dropZone, { dataTransfer: { files: [] } } as unknown as React.DragEvent);
    expect(dropZone.className).toContain("border-primary");
  });
});

describe("DragAndDropUploadZone: File validation via drop handler", () => {
  function fireDropComponent(
    setFiles: ReturnType<typeof vi.fn>,
    setErrors: ReturnType<typeof vi.fn>,
    files: File[],
  ): void {
    // Simulate what handleDrop does: it calls processDroppedFiles internally.
    // We recreate the drop behavior by directly calling the component's
    // handleDrop through the rendered DOM + fireEvent options.
    const resetKey = Date.now();
    render(<DragAndDropUploadZone key={resetKey} files={[]} errors={[]} setFiles={setFiles} setErrors={setErrors} />);

    // Find the drop zone element
    const dropZone = document.querySelector('[role="button"]') as HTMLElement;

    // Create a mock dataTransfer with files property
    const dataTransfer = { files: files as unknown as FileList } as DataTransfer;
    fireEvent.drop(dropZone, { dataTransfer, preventDefault: () => {}, stopPropagation: () => {} });
  }

  it("accepts an MP3 file and calls setFiles with it", () => {
    const setFiles = vi.fn();
    const setErrors = vi.fn();
    const mp3 = makeFile("track01.mp3", "audio/mpeg", 4096);

    fireDropComponent(setFiles, setErrors, [mp3]);

    expect(setFiles).toHaveBeenCalledWith([expect.objectContaining({ name: "track01.mp3" })]);
  });

  it("accepts a WAV file and calls setFiles", () => {
    const setFiles = vi.fn();
    const setErrors = vi.fn();
    const wav = makeFile("melody.wav", "audio/wav", 4096);

    fireDropComponent(setFiles, setErrors, [wav]);

    expect(setFiles).toHaveBeenCalledWith([expect.objectContaining({ name: "melody.wav" })]);
  });

  it("displays file preview name after adding files", () => {
    const mp3 = makeFile("track01.mp3", "audio/mpeg", 4096);
    const setFiles = vi.fn();
    const setErrors = vi.fn();

    render(
      <DragAndDropUploadZone
        files={[mp3]}
        errors={[]}
        setFiles={setFiles}
        setErrors={setErrors}
      />
    );

    expect(screen.getByText("track01.mp3")).toBeInTheDocument();
  });

  it("rejects a PDF file with error", () => {
    const setFiles = vi.fn();
    const setErrors = vi.fn();
    const pdf = makeFile("document.pdf", "application/pdf", 100);

    fireDropComponent(setFiles, setErrors, [pdf]);

    expect(setFiles).not.toHaveBeenCalled();
    expect(setErrors).toHaveBeenCalledTimes(1);
    expect(setErrors).toHaveBeenCalledWith([expect.stringContaining("not supported")]);
  });

  it("rejects oversized files (>50MB) with error", () => {
    const setFiles = vi.fn();
    const setErrors = vi.fn();
    const oversized = makeFile("huge.mp3", "audio/mpeg", 60 * 1024 * 1024);

    fireDropComponent(setFiles, setErrors, [oversized]);

    expect(setFiles).not.toHaveBeenCalled();
    expect(setErrors).toHaveBeenCalledTimes(1);
    expect(setErrors).toHaveBeenCalledWith([expect.stringContaining("exceeds the 50 MB limit")]);
  });

  it("renders rejection error messages in the UI", () => {
    const mockError = "File type \"application/pdf\" is not supported. Only MP3 and WAV files are accepted.";
    render(
      <DragAndDropUploadZone
        files={[]}
        errors={[mockError]}
        setFiles={vi.fn()}
        setErrors={vi.fn()}
      />
    );
    expect(screen.getByText(mockError)).toBeInTheDocument();
  });
});
