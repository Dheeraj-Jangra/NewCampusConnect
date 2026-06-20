export interface Channel {
  id: string
  label: string
  description: string
}

export const channels: Channel[] = [
  { id: 'general',    label: 'general-chat',  description: 'Global discussion space for all students and professors.' },
  { id: 'q-and-a',    label: 'faculty-q-a',   description: 'Academic clarifications and faculty discussion board.' },
  { id: 'aesthetics', label: 'ui-aesthetics', description: 'Visual design discussions, animations, and frontend guidelines.' },
  { id: 'study',      label: 'exam-prep-group', description: 'Student-run study groups and shared study tips.' },
]
