import { useEffect, useState, useMemo } from 'react'
import {
  type ForwardedLetterItem,
  getDormForwardedLetters,
  getStudentDeanForwardedLetters,
} from '@/services/logisticsApi'
import { ensureBase64DataUri } from '@/utils/qrUtils'
import {
  FileText,
  ShieldCheck,
  QrCode,
  Search,
  Lock,
  X,
  Building,
  Home,
  Utensils,
  RefreshCw,
  AlertCircle,
  Copy,
  Check,
} from 'lucide-react'
import { Button } from '@/components/ui/button'

interface ForwardedLettersViewProps {
  type: 'dorm' | 'student-dean'
  title?: string
  subtitle?: string
}

export default function ForwardedLettersView({
  type,
  title,
  subtitle,
}: ForwardedLettersViewProps) {
  const [letters, setLetters] = useState<ForwardedLetterItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedLetter, setSelectedLetter] = useState<ForwardedLetterItem | null>(null)
  const [isQrZoomModalOpen, setIsQrZoomModalOpen] = useState(false)
  const [copiedHash, setCopiedHash] = useState(false)

  const defaultTitle =
    type === 'dorm'
      ? 'Received Dormitory Clearance Letters'
      : 'Received Cafeteria Clearance Letters'

  const defaultSubtitle =
    type === 'dorm'
      ? 'Official Dean-verified residence clearance letters forwarded by students for dormitory room allocation.'
      : 'Official Dean-verified meal clearance letters forwarded by students for cafeteria dining authorization.'

  const fetchLetters = async () => {
    setIsLoading(true)
    setError(null)
    try {
      const data =
        type === 'dorm'
          ? await getDormForwardedLetters()
          : await getStudentDeanForwardedLetters()
      setLetters(data)
    } catch (err: any) {
      setError(err?.response?.data?.detail || 'Failed to load forwarded clearance letters.')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchLetters()
  }, [type])

  const filteredLetters = useMemo(() => {
    if (!searchTerm.trim()) return letters
    const term = searchTerm.toLowerCase().trim()
    return letters.filter(
      (item) =>
        item.student_name?.toLowerCase().includes(term) ||
        item.student_id_number?.toLowerCase().includes(term) ||
        item.department?.toLowerCase().includes(term) ||
        item.university_name?.toLowerCase().includes(term)
    )
  }, [letters, searchTerm])

  const copySignatureHash = (hash: string) => {
    if (!hash) return
    navigator.clipboard.writeText(hash)
    setCopiedHash(true)
    setTimeout(() => setCopiedHash(false), 2000)
  }

  return (
    <div className="space-y-6">
      {/* Header and Search Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-neutral-900 dark:text-white flex items-center gap-2">
            <FileText className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
            {title || defaultTitle}
          </h2>
          <p className="text-xs text-neutral-500 mt-0.5">
            {subtitle || defaultSubtitle}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
            <input
              type="text"
              placeholder="Search by student, ID, department..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="text-xs pl-9 pr-3 py-2 bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-indigo-500 w-64 shadow-xs"
            />
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={fetchLetters}
            disabled={isLoading}
            className="text-xs h-9 flex items-center gap-1.5 rounded-xl"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Error state */}
      {error && (
        <div className="p-4 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>{error}</span>
          <button onClick={fetchLetters} className="ml-auto underline font-bold">
            Retry
          </button>
        </div>
      )}

      {/* Stats row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-4 rounded-2xl bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-400">
              Total Letters Received
            </span>
            <p className="text-2xl font-black text-neutral-900 dark:text-white mt-0.5">
              {letters.length}
            </p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400 flex items-center justify-center font-bold">
            <FileText className="w-5 h-5" />
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-400">
              Dean Signatures Authenticated
            </span>
            <p className="text-2xl font-black text-emerald-600 dark:text-emerald-400 mt-0.5">
              {letters.filter((l) => Boolean(l.dean_signature_hash)).length}
            </p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400 flex items-center justify-center font-bold">
            <ShieldCheck className="w-5 h-5" />
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-400">
              Service Clearance Type
            </span>
            <p className="text-sm font-bold text-neutral-900 dark:text-white mt-1">
              {type === 'dorm' ? 'Dormitory Accommodation' : 'Cafeteria Dining Access'}
            </p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-amber-50 dark:bg-amber-950 text-amber-600 dark:text-amber-400 flex items-center justify-center font-bold">
            {type === 'dorm' ? <Home className="w-5 h-5" /> : <Utensils className="w-5 h-5" />}
          </div>
        </div>
      </div>

      {/* Letters List / Table */}
      {isLoading ? (
        <div className="p-12 text-center bg-white dark:bg-neutral-800/50 rounded-2xl border border-neutral-200 dark:border-neutral-800">
          <RefreshCw className="w-6 h-6 animate-spin text-neutral-400 mx-auto mb-2" />
          <p className="text-xs text-neutral-500">Loading received clearance letters...</p>
        </div>
      ) : filteredLetters.length === 0 ? (
        <div className="p-12 text-center bg-white dark:bg-neutral-800/50 rounded-2xl border border-dashed border-neutral-300 dark:border-neutral-700">
          <div className="w-12 h-12 rounded-full bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center mx-auto mb-3 text-neutral-400">
            <FileText className="w-6 h-6" />
          </div>
          <h4 className="text-sm font-bold text-neutral-800 dark:text-neutral-200">
            {searchTerm ? 'No matching letters found' : 'No forwarded clearance letters yet'}
          </h4>
          <p className="text-xs text-neutral-400 max-w-md mx-auto mt-1">
            {searchTerm
              ? `No student letters match "${searchTerm}". Try searching by another keyword.`
              : `When students at your university verify their credentials with their Department Dean and click 'Forward to ${
                  type === 'dorm' ? 'Dormitory' : 'Student Dean'
                }', their official letters and QR codes will appear here.`}
          </p>
        </div>
      ) : (
        <div className="bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-2xl overflow-hidden shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-neutral-50 dark:bg-neutral-800/80 text-[10px] uppercase font-bold text-neutral-500 dark:text-neutral-400 border-b border-neutral-200 dark:border-neutral-700">
                <tr>
                  <th className="p-3.5">Student</th>
                  <th className="p-3.5">ID / Department</th>
                  <th className="p-3.5">University</th>
                  <th className="p-3.5">Dean Sign-Off</th>
                  <th className="p-3.5">Clearance Period</th>
                  <th className="p-3.5">Forwarded Date</th>
                  <th className="p-3.5 text-right">Official Document</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200 dark:divide-neutral-700/60 font-sans">
                {filteredLetters.map((item) => (
                  <tr
                    key={item.student_id}
                    className="hover:bg-neutral-50/70 dark:hover:bg-neutral-700/30 transition-colors"
                  >
                    <td className="p-3.5">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-full bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 flex items-center justify-center font-bold text-xs flex-shrink-0">
                          {item.student_name ? item.student_name[0].toUpperCase() : 'S'}
                        </div>
                        <div>
                          <p className="font-bold text-neutral-900 dark:text-white">
                            {item.student_name || 'Student Candidate'}
                          </p>
                          <p className="text-[11px] text-neutral-400 font-mono">
                            {item.student_email || 'No email provided'}
                          </p>
                        </div>
                      </div>
                    </td>

                    <td className="p-3.5">
                      <div className="space-y-0.5">
                        <span className="font-mono font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/60 px-2 py-0.5 rounded text-[11px]">
                          {item.student_id_number}
                        </span>
                        <p className="text-[11px] text-neutral-500">
                          {item.department} (Year {item.academic_year})
                        </p>
                      </div>
                    </td>

                    <td className="p-3.5">
                      <span className="text-neutral-700 dark:text-neutral-300 font-medium">
                        {item.university_name || 'N/A'}
                      </span>
                    </td>

                    <td className="p-3.5">
                      <div className="space-y-1">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                          <ShieldCheck className="w-3 h-3 text-emerald-600" />
                          {item.dean_title || 'Department Dean'}
                        </span>
                        {item.dean_signature_hash && (
                          <p className="text-[9px] font-mono text-neutral-400">
                            HMAC: {item.dean_signature_hash.slice(0, 16)}...
                          </p>
                        )}
                      </div>
                    </td>

                    <td className="p-3.5 text-neutral-600 dark:text-neutral-300">
                      {item.valid_from && item.valid_until ? (
                        <span className="text-[11px]">
                          {item.valid_from} to {item.valid_until}
                        </span>
                      ) : (
                        <span className="text-[11px] text-neutral-400">Academic Term</span>
                      )}
                    </td>

                    <td className="p-3.5 text-[11px] text-neutral-500">
                      {item.forwarded_at
                        ? new Date(item.forwarded_at).toLocaleString(undefined, {
                            dateStyle: 'medium',
                            timeStyle: 'short',
                          })
                        : 'Recently'}
                    </td>

                    <td className="p-3.5 text-right">
                      <Button
                        size="sm"
                        onClick={() => setSelectedLetter(item)}
                        className="text-xs h-8 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl flex items-center gap-1.5 ml-auto shadow-xs"
                      >
                        <FileText className="w-3.5 h-3.5" />
                        View Letter & QR
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* MODAL: Full Official Clearance Letter Viewer */}
      {selectedLetter && (
        <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4 backdrop-blur-sm overflow-y-auto animate-fade-in">
          <div className="bg-white dark:bg-neutral-900 border-2 border-neutral-300 dark:border-neutral-700 rounded-3xl max-w-2xl w-full p-8 shadow-2xl space-y-6 relative my-8 select-none">
            {/* Top Close Button & Security Watermark */}
            <div className="flex items-center justify-between pb-3 border-b border-neutral-200 dark:border-neutral-800">
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-1 rounded-md text-[10px] font-black tracking-widest bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800 uppercase flex items-center gap-1">
                  <Lock className="w-3 h-3 text-emerald-600" />
                  AUTHENTICATED OFFICIAL INSTITUTIONAL RECORD
                </span>
                <span className="text-[11px] font-bold text-neutral-400">UN-EDITABLE</span>
              </div>
              <button
                onClick={() => setSelectedLetter(null)}
                className="p-1 rounded-xl text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* University Letterhead */}
            <div className="text-center space-y-1 border-b pb-4 border-neutral-200 dark:border-neutral-800">
              <div className="w-12 h-12 mx-auto rounded-full bg-indigo-50 dark:bg-indigo-950 flex items-center justify-center text-indigo-700 dark:text-indigo-300 font-bold mb-1 border border-indigo-200 dark:border-indigo-800">
                <Building className="w-6 h-6" />
              </div>
              <p className="text-[11px] font-bold tracking-widest text-neutral-500 uppercase">
                Federal Democratic Republic of Ethiopia
              </p>
              <h3 className="text-base font-black text-neutral-900 dark:text-white uppercase tracking-tight">
                Ministry of Education • Directorate of Academic Affairs
              </h3>
              <h4 className="text-sm font-bold text-indigo-600 dark:text-indigo-400 uppercase">
                Office of the Department Dean — {selectedLetter.department || 'Engineering & Technology'}
              </h4>
              <div className="flex justify-between items-center text-[10px] text-neutral-500 pt-2 px-2">
                <span>
                  Ref: REF/UoE/DEAN/{selectedLetter.student_id_number || 'STU'}-{new Date().getFullYear()}
                </span>
                <span>
                  Date:{' '}
                  {selectedLetter.dean_verified_at
                    ? new Date(selectedLetter.dean_verified_at).toLocaleDateString(undefined, {
                        dateStyle: 'long',
                      })
                    : new Date().toLocaleDateString()}
                </span>
              </div>
            </div>

            {/* Recipient & Student Information Block */}
            <div className="p-4 rounded-xl bg-neutral-50 dark:bg-neutral-800/50 border border-neutral-200/80 dark:border-neutral-700/80 text-xs space-y-1.5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div>
                  <span className="text-[10px] uppercase font-bold text-neutral-400">Addressed To:</span>
                  <p className="font-semibold text-neutral-800 dark:text-neutral-200">
                    {type === 'dorm' ? 'Dormitory Administration Directorate' : 'Student Union & Dining Services Division'}
                  </p>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold text-neutral-400">Student Candidate:</span>
                  <p className="font-bold text-neutral-900 dark:text-white">
                    {selectedLetter.student_name}
                  </p>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold text-neutral-400">Student ID / Dept:</span>
                  <p className="font-mono text-neutral-800 dark:text-neutral-200">
                    {selectedLetter.student_id_number} • {selectedLetter.department}
                  </p>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold text-neutral-400">University Affiliation:</span>
                  <p className="font-semibold text-neutral-800 dark:text-neutral-200">
                    {selectedLetter.university_name || 'N/A'} (Year {selectedLetter.academic_year})
                  </p>
                </div>
              </div>
            </div>

            {/* Letter Title & Custom Body */}
            <div className="space-y-3">
              <h4 className="text-xs font-black uppercase text-neutral-900 dark:text-white tracking-wide border-l-4 border-indigo-600 pl-2">
                {selectedLetter.letter_title || 'CAMPUS DORMITORY & CAFETERIA CLEARANCE PERMIT'}
              </h4>
              <div className="text-xs text-neutral-700 dark:text-neutral-300 leading-relaxed space-y-2 whitespace-pre-wrap font-serif bg-neutral-50/50 dark:bg-neutral-900/50 p-4 rounded-xl border border-neutral-200/60 dark:border-neutral-800">
                {selectedLetter.letter_notes ||
                  `This campus logistics clearance certifies that ${selectedLetter.student_name} is in full compliance with university residency regulations and is hereby granted official authorization for campus dormitory accommodation and dining hall meal card access.`}
              </div>
            </div>

            {/* Allowed Services Table */}
            <div className="space-y-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-neutral-500">
                Authorized University Services & Provisions
              </span>
              <div className="border border-neutral-200 dark:border-neutral-800 rounded-xl overflow-hidden text-xs">
                <table className="w-full text-left">
                  <thead className="bg-neutral-100 dark:bg-neutral-800 text-[10px] uppercase font-bold text-neutral-600 dark:text-neutral-400">
                    <tr>
                      <th className="p-2.5">Institutional Service</th>
                      <th className="p-2.5">Clearance Status</th>
                      <th className="p-2.5">Validity Period</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
                    <tr>
                      <td className="p-2.5 font-semibold text-neutral-800 dark:text-neutral-200 flex items-center gap-1.5">
                        <Home className="w-3.5 h-3.5 text-indigo-600" /> Dormitory Accommodation
                      </td>
                      <td className="p-2.5">
                        {selectedLetter.allow_dorm !== false ? (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                            AUTHORIZED & GRANTED
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400">
                            NOT APPLICABLE
                          </span>
                        )}
                      </td>
                      <td className="p-2.5 text-neutral-500 text-[11px]">
                        {selectedLetter.valid_from && selectedLetter.valid_until
                          ? `${selectedLetter.valid_from} to ${selectedLetter.valid_until}`
                          : 'Full Internship Term'}
                      </td>
                    </tr>
                    <tr>
                      <td className="p-2.5 font-semibold text-neutral-800 dark:text-neutral-200 flex items-center gap-1.5">
                        <Utensils className="w-3.5 h-3.5 text-amber-600" /> Student Cafeteria Meal Access
                      </td>
                      <td className="p-2.5">
                        {selectedLetter.allow_food !== false ? (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                            AUTHORIZED & GRANTED
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400">
                            NOT APPLICABLE
                          </span>
                        )}
                      </td>
                      <td className="p-2.5 text-neutral-500 text-[11px]">
                        {selectedLetter.valid_from && selectedLetter.valid_until
                          ? `${selectedLetter.valid_from} to ${selectedLetter.valid_until}`
                          : 'Full Internship Term'}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* Signature & Auto-generated Dean QR Code Block */}
            <div className="pt-4 border-t border-neutral-200 dark:border-neutral-800 flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="space-y-1 text-center sm:text-left">
                <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-400">
                  Institutional Sign-Off & Verification Seal
                </span>
                <p className="text-sm font-black text-neutral-900 dark:text-white">
                  {selectedLetter.dean_title || 'Department Dean'}
                </p>
                <p className="text-xs text-neutral-500">
                  Department Dean, {selectedLetter.department}
                </p>
                <div className="pt-1 flex items-center gap-1.5">
                  <span className="inline-block text-[9px] font-mono text-neutral-400 bg-neutral-100 dark:bg-neutral-800 px-2 py-0.5 rounded">
                    HMAC: {selectedLetter.dean_signature_hash ? `${selectedLetter.dean_signature_hash.slice(0, 24)}...` : 'HMAC-SHA256-AUTHENTICATED'}
                  </span>
                  {selectedLetter.dean_signature_hash && (
                    <button
                      onClick={() => copySignatureHash(selectedLetter.dean_signature_hash)}
                      className="p-1 rounded text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200"
                      title="Copy HMAC hash"
                    >
                      {copiedHash ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                    </button>
                  )}
                </div>
              </div>

              {/* Scannable Dean QR Code */}
              <div
                onClick={() => setIsQrZoomModalOpen(true)}
                className="flex flex-col items-center gap-1.5 p-3 rounded-2xl bg-white dark:bg-neutral-800/90 border-2 border-emerald-500/50 hover:border-emerald-500 hover:shadow-lg transition-all cursor-pointer group flex-shrink-0"
                title="Directly scannable by camera. Click to inspect."
              >
                {selectedLetter.qr_code ? (
                  <div className="relative">
                    <img
                      src={ensureBase64DataUri(selectedLetter.qr_code)}
                      alt="Dean Digital QR Signature"
                      className="w-24 h-24 rounded-xl bg-white p-1 border shadow-xs group-hover:scale-105 transition-transform"
                    />
                    <div className="absolute inset-0 bg-emerald-950/0 group-hover:bg-emerald-950/15 rounded-xl transition-colors flex items-center justify-center">
                      <span className="opacity-0 group-hover:opacity-100 bg-black/75 text-white text-[9px] px-2 py-0.5 rounded-full font-bold transition-opacity shadow-sm">
                        Zoom
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="w-24 h-24 rounded-xl bg-neutral-200 dark:bg-neutral-700 flex items-center justify-center">
                    <QrCode className="w-8 h-8 text-neutral-400" />
                  </div>
                )}
                <span className="text-[10px] font-extrabold uppercase tracking-wider text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                  <QrCode className="w-3 h-3" /> Scannable Dean QR
                </span>
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center justify-end pt-3 border-t border-neutral-200 dark:border-neutral-800">
              <Button
                size="sm"
                onClick={() => setSelectedLetter(null)}
                className="text-xs h-9 bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 hover:bg-neutral-800 px-6 rounded-xl font-bold"
              >
                Close Letter
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* QR ZOOM MODAL */}
      {isQrZoomModalOpen && selectedLetter?.qr_code && (
        <div className="fixed inset-0 z-60 bg-black/80 flex items-center justify-center p-4 backdrop-blur-md animate-fade-in">
          <div className="bg-white dark:bg-neutral-900 border-2 border-emerald-500 rounded-3xl max-w-sm w-full p-6 shadow-2xl space-y-4 text-center">
            <div className="flex items-center justify-between pb-2 border-b border-neutral-200 dark:border-neutral-800">
              <span className="text-xs font-bold text-neutral-900 dark:text-white flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-emerald-600" />
                Dean Signature QR Inspection
              </span>
              <button
                onClick={() => setIsQrZoomModalOpen(false)}
                className="p-1 rounded-xl text-neutral-400 hover:text-neutral-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4 bg-white rounded-2xl border flex items-center justify-center">
              <img
                src={ensureBase64DataUri(selectedLetter.qr_code)}
                alt="Zoomed Dean QR"
                className="w-56 h-56 object-contain"
              />
            </div>
            <div className="space-y-1">
              <p className="text-xs font-bold text-neutral-900 dark:text-white">
                {selectedLetter.student_name} ({selectedLetter.student_id_number})
              </p>
              <p className="text-[11px] text-neutral-400">
                Endorsed by {selectedLetter.dean_title}
              </p>
            </div>
            <Button
              size="sm"
              onClick={() => setIsQrZoomModalOpen(false)}
              className="w-full text-xs h-9 bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 font-bold rounded-xl"
            >
              Done
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
