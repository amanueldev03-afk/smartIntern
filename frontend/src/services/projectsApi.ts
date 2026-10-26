import api from './api'

export interface ProjectTeamMember {
  id: string
  student: {
    id: string
    user: {
      id: string
      first_name: string
      last_name: string
      email: string
    }
    department: string
    primary_skill?: string
  }
  assigned_role: string
  primary_stack: string
}

export interface ProjectTeamAdvisor {
  id: string
  email: string
  username: string
  first_name: string
  last_name: string
}

export interface ProjectTeamData {
  id: string
  team_name: string
  project_title: string
  cohort: string
  assigned_advisor: ProjectTeamAdvisor | null
  srs_status: 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'REVISION_REQUIRED'
  srs_document: string | null
  srs_feedback: string | null
  srs_revision_deadline: string | null
  coding_unlocked: boolean
  members: ProjectTeamMember[]
  documentation_deadline?: string | null
  implementation_deadline?: string | null
  documentation_submitted_at?: string | null
  implementation_submitted_at?: string | null
  implementation_repo_url?: string | null
  implementation_verified_by_advisor?: boolean
  created_at: string
}

export interface ProjectTeamMessageItem {
  id: string
  team: string
  sender: {
    id: string
    email: string
    first_name: string
    last_name: string
    role: string
  }
  message_type: 'GENERAL' | 'SRS_FEEDBACK' | 'ADVISORY_NOTICE' | 'SPRINT_UPDATE'
  content: string
  created_at: string
}

export interface MyTeamChannelResponse {
  team: ProjectTeamData | null
  messages: ProjectTeamMessageItem[]
}

export async function getMyTeamChannel(): Promise<MyTeamChannelResponse> {
  const response = await api.get<MyTeamChannelResponse>('/v1/projects/my-channel/')
  return response.data
}

export async function uploadTeamSRS(teamId: string, file: File): Promise<any> {
  const formData = new FormData()
  formData.append('srs_document', file)
  const response = await api.post(`/v1/projects/teams/${teamId}/srs/upload/`, formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  })
  return response.data
}

export async function reviewTeamSRS(
  teamId: string,
  decision: 'APPROVED' | 'REJECTED',
  feedback?: string
): Promise<any> {
  const response = await api.post(`/v1/projects/teams/${teamId}/srs/review/`, {
    decision,
    feedback: feedback || '',
  })
  return response.data
}

export async function getTeamMessages(teamId: string): Promise<ProjectTeamMessageItem[]> {
  const response = await api.get<ProjectTeamMessageItem[]>(`/v1/projects/teams/${teamId}/messages/`)
  return response.data
}

export async function sendTeamMessage(
  teamId: string,
  content: string,
  message_type: string = 'GENERAL'
): Promise<ProjectTeamMessageItem> {
  const response = await api.post<ProjectTeamMessageItem>(`/v1/projects/teams/${teamId}/messages/`, {
    content,
    message_type,
  })
  return response.data
}

export async function getAllProjectTeams(): Promise<ProjectTeamData[]> {
  const response = await api.get<ProjectTeamData[]>('/v1/projects/teams/')
  return response.data
}
