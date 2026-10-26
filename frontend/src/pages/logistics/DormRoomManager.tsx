import { useEffect, useState, useCallback } from 'react'
import {
  getDormRoomGrid,
  getCampusLogistics,
  assignDormRoom,
  returnDormKey,
  type DormRoomItem,
  type CampusLogisticsItem,
} from '@/services/logisticsApi'
import {
  Building2,
  Key,
  CheckCircle,
  AlertCircle,
  Users,
  PlusCircle,
  RefreshCw,
  DoorOpen,
  ArrowRightLeft,
  X,
  ShieldCheck,
  Utensils,
} from 'lucide-react'
import { Button } from '@/components/ui/button'

export default function DormRoomManager() {
  const [rooms, setRooms] = useState<DormRoomItem[]>([])
  const [unassignedStudents, setUnassignedStudents] = useState<CampusLogisticsItem[]>([])
  const [selectedBlock, setSelectedBlock] = useState<string>('all')
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  // Assign Modal State
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [selectedStudentId, setSelectedStudentId] = useState('')
  const [targetBlock, setTargetBlock] = useState('Block A')
  const [targetRoom, setTargetRoom] = useState('101')
  const [targetBed, setTargetBed] = useState('Bed 1')
  const [issueKeyNow, setIssueKeyNow] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const fetchData = useCallback(async () => {
    try {
      setIsLoading(true)
      setError(null)
      const [gridData, logisticsData] = await Promise.all([
        getDormRoomGrid(selectedBlock === 'all' ? undefined : selectedBlock),
        getCampusLogistics({ dean_approved: true }),
      ])
      setRooms(gridData.rooms)
      // Filter students who are dean approved but not yet assigned a dorm
      const unassigned = logisticsData.filter(
        (item) => item.dean_approved && (!item.dorm_room || item.dorm_status === 'UNASSIGNED')
      )
      setUnassignedStudents(unassigned)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to fetch dormitory records'
      setError(msg)
    } finally {
      setIsLoading(false)
    }
  }, [selectedBlock])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const handleAssignDorm = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedStudentId) {
      setError('Please select a student to assign.')
      return
    }

    const student = unassignedStudents.find((s) => s.id === selectedStudentId)
    if (!student?.dean_approved) {
      setError('Cannot assign dorm: Missing Department Dean cryptographic digital sign-off.')
      return
    }
    if (!student?.meal_card_active) {
      setError('Cannot assign dorm: Missing Student Union meal card activation & dining clearance.')
      return
    }

    try {
      setIsSubmitting(true)
      setError(null)
      await assignDormRoom(selectedStudentId, {
        dorm_block: targetBlock.trim(),
        dorm_room: targetRoom.trim(),
        dorm_bed_number: targetBed.trim(),
        issue_key: issueKeyNow,
      })
      setSuccessMessage(`Dorm assigned successfully: ${targetBlock}, Room ${targetRoom} (${targetBed})!`)
      setIsModalOpen(false)
      setSelectedStudentId('')
      fetchData()
      setTimeout(() => setSuccessMessage(null), 4000)
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail || 'Assignment failed'
      setError(msg)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleKeyReturn = async (logisticsId: string, studentName: string) => {
    try {
      setError(null)
      await returnDormKey(logisticsId)
      setSuccessMessage(`Key returned and exit clearance logged for ${studentName}.`)
      fetchData()
      setTimeout(() => setSuccessMessage(null), 4000)
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail || 'Key return failed'
      setError(msg)
    }
  }

  // Aggregate stats
  const totalOccupants = rooms.reduce((acc, r) => acc + r.occupied_beds, 0)
  const totalKeysIssued = rooms.reduce(
    (acc, r) => acc + r.occupants.filter((o) => o.key_issued).length,
    0
  )
  const pendingKeyReturns = rooms.reduce(
    (acc, r) => acc + r.occupants.filter((o) => o.dorm_status === 'PENDING_KEY_RETURN').length,
    0
  )

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-slate-100 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-5">
          <div>
            <div className="flex items-center gap-2">
              <span className="p-2 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                <Building2 className="w-6 h-6" />
              </span>
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
                Dormitory Room & Key Manager
              </h1>
            </div>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              Housing clearance grid for Track 1 In-House software squads (6–8 beds per room).
            </p>
          </div>

          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              onClick={fetchData}
              disabled={isLoading}
              className="flex items-center gap-2"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
            <Button
              onClick={() => setIsModalOpen(true)}
              className="bg-emerald-600 hover:bg-emerald-700 text-white flex items-center gap-2"
            >
              <PlusCircle className="w-4 h-4" />
              Assign Student Room
            </Button>
          </div>
        </div>

        {/* Alerts */}
        {error && (
          <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 flex items-center gap-3">
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
            <p className="text-sm font-medium">{error}</p>
          </div>
        )}
        {successMessage && (
          <div className="p-4 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 flex items-center gap-3">
            <CheckCircle className="w-5 h-5 flex-shrink-0" />
            <p className="text-sm font-medium">{successMessage}</p>
          </div>
        )}

        {/* Stats Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
          <div className="p-5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-sm flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-wider font-semibold text-slate-500 dark:text-slate-400">
                Active Residents
              </p>
              <p className="text-3xl font-extrabold mt-1 text-slate-900 dark:text-slate-50">
                {totalOccupants}
              </p>
            </div>
            <div className="p-3 bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 rounded-full">
              <Users className="w-6 h-6" />
            </div>
          </div>

          <div className="p-5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-sm flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-wider font-semibold text-slate-500 dark:text-slate-400">
                Active Rooms
              </p>
              <p className="text-3xl font-extrabold mt-1 text-slate-900 dark:text-slate-50">
                {rooms.length}
              </p>
            </div>
            <div className="p-3 bg-blue-500/10 text-blue-600 dark:text-blue-400 rounded-full">
              <DoorOpen className="w-6 h-6" />
            </div>
          </div>

          <div className="p-5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-sm flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-wider font-semibold text-slate-500 dark:text-slate-400">
                Keys Checked Out
              </p>
              <p className="text-3xl font-extrabold mt-1 text-emerald-600 dark:text-emerald-400">
                {totalKeysIssued}
              </p>
            </div>
            <div className="p-3 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 rounded-full">
              <Key className="w-6 h-6" />
            </div>
          </div>

          <div className="p-5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-sm flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-wider font-semibold text-slate-500 dark:text-slate-400">
                Pending Key Return
              </p>
              <p className="text-3xl font-extrabold mt-1 text-amber-600 dark:text-amber-400">
                {pendingKeyReturns}
              </p>
            </div>
            <div className="p-3 bg-amber-500/10 text-amber-600 dark:text-amber-400 rounded-full">
              <ArrowRightLeft className="w-6 h-6" />
            </div>
          </div>
        </div>

        {/* Block Filter */}
        <div className="flex items-center gap-2 bg-white dark:bg-slate-800 p-3 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider ml-2">
            Filter Block:
          </span>
          {['all', 'Block A', 'Block B', 'Block C'].map((block) => (
            <button
              key={block}
              onClick={() => setSelectedBlock(block)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                selectedBlock === block
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'
              }`}
            >
              {block === 'all' ? 'All Blocks' : block}
            </button>
          ))}
        </div>

        {/* Room Grid */}
        {isLoading ? (
          <div className="py-20 text-center">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-emerald-600 mx-auto"></div>
            <p className="mt-3 text-sm text-slate-500">Loading dormitory room grid...</p>
          </div>
        ) : rooms.length === 0 ? (
          <div className="py-16 text-center bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">
            <Building2 className="w-12 h-12 text-slate-400 mx-auto mb-3" />
            <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              No rooms assigned yet
            </h3>
            <p className="text-sm text-slate-500 mt-1">
              Click &apos;Assign Student Room&apos; above to assign Dean-approved students to dormitory beds.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {rooms.map((roomItem) => {
              const occupancyRatio = `${roomItem.occupied_beds}/${roomItem.bed_capacity}`
              const isFull = roomItem.occupied_beds >= roomItem.bed_capacity
              const occupancyPercentage = Math.round(
                (roomItem.occupied_beds / roomItem.bed_capacity) * 100
              )

              return (
                <div
                  key={`${roomItem.block}-${roomItem.room}`}
                  className="rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden flex flex-col justify-between"
                >
                  {/* Room Card Header */}
                  <div className="p-4 border-b border-slate-100 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/80 flex items-center justify-between">
                    <div>
                      <div className="text-xs uppercase font-semibold text-slate-500">
                        {roomItem.block}
                      </div>
                      <div className="text-lg font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                        <span>Room {roomItem.room}</span>
                      </div>
                    </div>

                    <div className="text-right">
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold border ${
                          isFull
                            ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20'
                            : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
                        }`}
                      >
                        {occupancyRatio} Beds
                      </span>
                      <div className="w-24 bg-slate-200 dark:bg-slate-700 rounded-full h-1.5 mt-2">
                        <div
                          className={`h-1.5 rounded-full ${
                            isFull ? 'bg-rose-500' : 'bg-emerald-500'
                          }`}
                          style={{ width: `${occupancyPercentage}%` }}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Bed Occupants List */}
                  <div className="p-4 space-y-3 flex-1">
                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                      Occupants & Bed Status:
                    </p>
                    <div className="space-y-2">
                      {roomItem.occupants.map((occ) => {
                        const isPendingReturn = occ.dorm_status === 'PENDING_KEY_RETURN'
                        return (
                          <div
                            key={occ.logistics_id}
                            className={`p-2.5 rounded-lg border text-xs flex items-center justify-between ${
                              isPendingReturn
                                ? 'bg-amber-50 dark:bg-amber-950/30 border-amber-300 dark:border-amber-800 text-amber-900 dark:text-amber-200'
                                : 'bg-slate-50 dark:bg-slate-900/60 border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200'
                            }`}
                          >
                            <div>
                              <div className="font-semibold flex items-center gap-1.5">
                                <span className="font-mono px-1 py-0.2 bg-white dark:bg-slate-800 rounded border border-slate-300 dark:border-slate-600 text-[10px]">
                                  {occ.bed_number}
                                </span>
                                <span>{occ.student_name}</span>
                              </div>
                              <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                                ID: {occ.student_id}
                              </div>
                            </div>

                            <div className="flex items-center gap-2">
                              {occ.key_issued ? (
                                <span
                                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold ${
                                    isPendingReturn
                                      ? 'bg-amber-500/20 text-amber-700 dark:text-amber-300'
                                      : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                                  }`}
                                  title={isPendingReturn ? 'Key Return Overdue' : 'Key Issued'}
                                >
                                  <Key className="w-3 h-3" />
                                  {isPendingReturn ? 'Return Overdue' : 'Key Issued'}
                                </span>
                              ) : (
                                <span className="text-[11px] text-slate-400 italic">No Key</span>
                              )}

                              <button
                                type="button"
                                onClick={() => handleKeyReturn(occ.logistics_id, occ.student_name)}
                                title="Record Key Return & Exit Clearance"
                                className="px-2 py-1 text-[11px] font-medium bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 rounded transition-colors"
                              >
                                Return
                              </button>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>

                  {/* Empty Bed Indicator */}
                  {!isFull && (
                    <div className="px-4 py-2.5 bg-slate-50 dark:bg-slate-900/40 border-t border-slate-100 dark:border-slate-700/60 text-xs text-slate-500 flex items-center justify-between">
                      <span>{roomItem.bed_capacity - roomItem.occupied_beds} vacant beds available</span>
                      <span className="text-emerald-600 dark:text-emerald-400 font-semibold cursor-pointer" onClick={() => {
                        setTargetBlock(roomItem.block)
                        setTargetRoom(roomItem.room)
                        setTargetBed(`Bed ${roomItem.occupied_beds + 1}`)
                        setIsModalOpen(true)
                      }}>
                        + Quick Assign
                      </span>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {/* Assignment Modal */}
        {isModalOpen && (
          <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
            <div className="bg-white dark:bg-slate-800 rounded-2xl max-w-md w-full p-6 shadow-xl border border-slate-200 dark:border-slate-700 relative">
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X className="w-5 h-5" />
              </button>

              <div className="flex items-center gap-2 mb-4">
                <span className="p-2 rounded-lg bg-emerald-500/10 text-emerald-600">
                  <DoorOpen className="w-5 h-5" />
                </span>
                <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">
                  Assign Dorm Room & Bed
                </h3>
              </div>

              <form onSubmit={handleAssignDorm} className="space-y-4">
                {/* Select Student */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Select Dean-Approved Student:
                  </label>
                  <select
                    value={selectedStudentId}
                    onChange={(e) => setSelectedStudentId(e.target.value)}
                    required
                    className="w-full text-xs p-2.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 focus:ring-2 focus:ring-emerald-500"
                  >
                    <option value="">-- Choose Student ({unassignedStudents.length} available) --</option>
                    {unassignedStudents.map((st) => (
                      <option key={st.id} value={st.id}>
                        {st.student_name} ({st.student_id_number}) - {st.department} {st.meal_card_active ? '✓ Meal Cleared' : '⏳ Pending Union'}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Two-Letter Clearance Check Box */}
                {(() => {
                  const selectedStudent = unassignedStudents.find((st) => st.id === selectedStudentId)
                  if (!selectedStudent) return null

                  const isDeanCleared = selectedStudent.dean_approved
                  const isUnionCleared = selectedStudent.meal_card_active && Boolean(selectedStudent.meal_card_number)
                  const isBothCleared = isDeanCleared && isUnionCleared

                  return (
                    <div className="p-3.5 rounded-xl border bg-slate-50 dark:bg-slate-900/60 space-y-2.5">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block">
                        Institutional Two-Letter Clearance Verification
                      </span>

                      {/* Letter 1: Department Dean Clearance Letter */}
                      <div className="flex items-start justify-between text-xs p-2 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                        <div className="space-y-0.5">
                          <div className="font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                            <ShieldCheck className="w-3.5 h-3.5 text-indigo-600" />
                            Department Dean Clearance Letter
                          </div>
                          <div className="text-[10px] text-slate-400 font-mono truncate max-w-[240px]">
                            HMAC: {selectedStudent.dean_signature_hash ? selectedStudent.dean_signature_hash.slice(0, 24) + '...' : 'Dean Verified'}
                          </div>
                        </div>
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          isDeanCleared
                            ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                            : 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
                        }`}>
                          {isDeanCleared ? 'APPROVED' : 'MISSING'}
                        </span>
                      </div>

                      {/* Letter 2: Student Union Dining & Residency Clearance */}
                      <div className="flex items-start justify-between text-xs p-2 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                        <div className="space-y-0.5">
                          <div className="font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                            <Utensils className="w-3.5 h-3.5 text-amber-600" />
                            Student Union Meal & Housing Clearance
                          </div>
                          <div className="text-[10px] text-slate-400 font-mono">
                            Meal Card: {selectedStudent.meal_card_number || 'Not Activated by Union'}
                          </div>
                        </div>
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          isUnionCleared
                            ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                            : 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
                        }`}>
                          {isUnionCleared ? 'ACTIVE' : 'PENDING'}
                        </span>
                      </div>

                      {/* Date Window Check */}
                      <div className="text-[11px] text-slate-500 flex items-center justify-between pt-1">
                        <span>Schedule Validity Window:</span>
                        <span className="font-semibold text-slate-700 dark:text-slate-300">
                          {selectedStudent.valid_from && selectedStudent.valid_until
                            ? `${selectedStudent.valid_from} to ${selectedStudent.valid_until}`
                            : 'Current In-House Cohort'}
                        </span>
                      </div>

                      {/* Warning if not cleared */}
                      {!isBothCleared && (
                        <div className="p-2 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300 text-[11px] font-medium flex items-center gap-1.5">
                          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                          <span>Both Dean sign-off and Student Union meal card activation must be complete before assigning a room.</span>
                        </div>
                      )}
                    </div>
                  )
                })()}

                {/* Dorm Block */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Building Block:
                  </label>
                  <select
                    value={targetBlock}
                    onChange={(e) => setTargetBlock(e.target.value)}
                    className="w-full text-xs p-2.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900"
                  >
                    <option value="Block A">Block A</option>
                    <option value="Block B">Block B</option>
                    <option value="Block C">Block C</option>
                  </select>
                </div>

                {/* Room Number & Bed */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Room Number:
                    </label>
                    <input
                      type="text"
                      value={targetRoom}
                      onChange={(e) => setTargetRoom(e.target.value)}
                      placeholder="e.g. 101"
                      required
                      className="w-full text-xs p-2.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Bed Number:
                    </label>
                    <select
                      value={targetBed}
                      onChange={(e) => setTargetBed(e.target.value)}
                      className="w-full text-xs p-2.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900"
                    >
                      {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
                        <option key={n} value={`Bed ${n}`}>
                          Bed {n}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Issue Key Checkbox */}
                <div className="flex items-center gap-2 pt-2">
                  <input
                    type="checkbox"
                    id="issueKeyNow"
                    checked={issueKeyNow}
                    onChange={(e) => setIssueKeyNow(e.target.checked)}
                    className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                  />
                  <label htmlFor="issueKeyNow" className="text-xs text-slate-700 dark:text-slate-300">
                    Issue physical room key immediately (<Key className="w-3 h-3 inline text-emerald-600" />)
                  </label>
                </div>

                {/* Submit button */}
                <div className="pt-3 flex justify-end gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setIsModalOpen(false)}
                    className="text-xs"
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    disabled={isSubmitting || (() => {
                      const st = unassignedStudents.find((s) => s.id === selectedStudentId)
                      return !st?.dean_approved || !st?.meal_card_active
                    })()}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium disabled:opacity-50"
                  >
                    {isSubmitting ? 'Assigning...' : 'Confirm Room & Bed (1-8)'}
                  </Button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
