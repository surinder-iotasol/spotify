import { test, expect } from '@playwright/test';

test.describe('DragAndDropUploadZone E2E', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/upload-zone-test');
    await expect(
      page.getByRole('button', { name: /Drop files here/i }),
    ).toBeVisible();
  });

  test('renders drop zone with visible border and hover state', async ({ page }) => {
    const zone = page.getByRole('button', { name: /Drop files here/i });
    await expect(zone).toBeVisible();
    await expect(zone).toContainText(/Drag & drop/i);
    // Verify the rounded border class exists on the DOM element
    const frame = zone.locator('xpath=..');
    const classes = await frame.getAttribute('class');
    expect(classes).toContain('rounded');
  });

  test('accepts MP3 file and shows file preview', async ({ page }) => {
    const zone = page.getByRole('button', { name: /Drop files here/i });
    const file = await page.createContext({}).newPage();
    
    // Create a file object and drag it in
    const mp3File = {
      name: 'test-song.mp3',
      mimeType: 'audio/mpeg',
      buffer: Buffer.alloc(1024),
    };
    
    // Use drag-and-drop via evaluate
    await page.evaluate(async ([zoneSelector, fileData]) => {
      const zone = document.querySelector(zoneSelector);
      if (!zone) return;
      
      const dataTransfer = new DataTransfer();
      const blob = new Blob([fileData.buffer || []], { type: fileData.mimeType });
      const file = new File([blob], fileData.name, { type: fileData.mimeType });
      dataTransfer.items.add(file);
      
      zone.dispatchEvent(new DragEvent('dragover', { dataTransfer }));
      zone.dispatchEvent(new DragEvent('drop', { dataTransfer }));
    }, ['[role=button]', mp3File]);

    // Wait a tick for state updates
    await page.waitForTimeout(500);
    
    // Check accepted files list shows the filename
    await expect(page.getByText('test-song.mp3')).toBeVisible();
  });
  
  test('accepts WAV file', async ({ page }) => {
    const wavFile = {
      name: 'test-track.wav',
      mimeType: 'audio/wav',
    };
    
    await page.evaluate(async ([zoneSelector, fileData]) => {
      const zone = document.querySelector(zoneSelector);
      if (!zone) return;
      
      const dataTransfer = new DataTransfer();
      const blob = new Blob([], { type: fileData.mimeType });
      const file = new File([blob], fileData.name, { type: fileData.mimeType });
      dataTransfer.items.add(file);
      
      zone.dispatchEvent(new DragEvent('drop', { dataTransfer }));
    }, ['[role=button]', wavFile]);
    
    await page.waitForTimeout(500);
    await expect(page.getByText('test-track.wav')).toBeVisible();
  });

  test('rejects oversized files (>50MB) with error message', async ({ page }) => {
    const oversizedFile = {
      name: 'huge-song.mp3',
      mimeType: 'audio/mpeg',
      size: 60 * 1024 * 1024, // 60 MB
    };
    
    await page.evaluate(async ([zoneSelector, fileData]) => {
      const zone = document.querySelector(zoneSelector);
      if (!zone) return;
      
      const dataTransfer = new DataTransfer();
      const blob = new Blob([], { type: fileData.mimeType });
      const file = new File([blob], fileData.name, { type: fileData.mimeType });
      Object.defineProperty(file, 'size', { value: fileData.size });
      dataTransfer.items.add(file);
      
      zone.dispatchEvent(new DragEvent('drop', { dataTransfer }));
    }, ['[role=button]', oversizedFile]);
    
    await page.waitForTimeout(500);
    // Should show an error
    await expect(page.locator('text=ERROR:')).toBeVisible();
  });

  test('rejects wrong format with error message', async ({ page }) => {
    const invalidFile = {
      name: 'document.pdf',
      mimeType: 'application/pdf',
    };
    
    await page.evaluate(async ([zoneSelector, fileData]) => {
      const zone = document.querySelector(zoneSelector);
      if (!zone) return;
      
      const dataTransfer = new DataTransfer();
      const blob = new Blob([], { type: fileData.mimeType });
      const file = new File([blob], fileData.name, { type: fileData.mimeType });
      dataTransfer.items.add(file);
      
      zone.dispatchEvent(new DragEvent('drop', { dataTransfer }));
    }, ['[role=button]', invalidFile]);
    
    await page.waitForTimeout(500);
    // Should show an error
    await expect(page.locator('text=ERROR:')).toBeVisible();
  });
});
