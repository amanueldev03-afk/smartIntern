import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import ResumePreview from '../components/ResumePreview'

vi.mock('docx-preview', () => ({
  renderAsync: vi.fn(async (_blob: Blob, container: HTMLElement) => {
    container.innerHTML = '<p>Rendered docx</p>'
  }),
}))

describe('ResumePreview', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders a PDF in an embed element for a .pdf resume URL', () => {
    render(<ResumePreview url="http://media/resumes/my-cv.pdf" />)
    const embed = document.querySelector('embed[type="application/pdf"]')
    expect(embed).not.toBeNull()
    expect(embed?.getAttribute('src')).toBe('http://media/resumes/my-cv.pdf')
    expect(embed?.getAttribute('title')).toBe('my-cv.pdf')
  })

  it('detects a DOCX from the URL even when the display-name fallback says .pdf', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      blob: async () => new Blob(['docx'], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }),
    }) as unknown as typeof fetch

    render(<ResumePreview url="http://media/resumes/my-cv.docx" fileName="Resume.pdf" />)

    // DOCX branch selected (no PDF embed), docx-preview rendered the content
    expect(document.querySelector('embed[type="application/pdf"]')).toBeNull()
    expect(await screen.findByText('Rendered docx')).toBeInTheDocument()
  })

  it('detects a DOCX when no display name is passed', async () => {
    const docxPreview = await import('docx-preview')
    const renderAsyncMock = vi.mocked(docxPreview.renderAsync)

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      blob: async () => new Blob(['docx'], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }),
    }) as unknown as typeof fetch

    render(<ResumePreview url="http://media/resumes/my-cv.docx" />)
    await screen.findByText('Rendered docx')
    expect(renderAsyncMock).toHaveBeenCalled()
    expect(document.querySelector('embed[type="application/pdf"]')).toBeNull()
  })
})
