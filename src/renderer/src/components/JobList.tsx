import { useState } from 'react'
import { RenderJob } from '../../../main/types'
import { JobCard } from './JobCard'
import styles from './JobList.module.css'

interface Props {
  jobs: RenderJob[]
  selectedJobId: string | null
  onSelect: (id: string) => void
  onRemove: (id: string) => void
  onCancel: (id: string) => void
  onRetry: (id: string) => void
  onOpenFolder: (id: string) => void
  onReorder: (ids: string[]) => void
}

export function JobList({ jobs, selectedJobId, onSelect, onRemove, onCancel, onRetry, onOpenFolder, onReorder }: Props): JSX.Element {
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)

  const handleDrop = (targetIndex: number): void => {
    if (dragIndex === null || dragIndex === targetIndex) {
      setDragIndex(null)
      setDragOverIndex(null)
      return
    }
    const newOrder = [...jobs]
    const [moved] = newOrder.splice(dragIndex, 1)
    newOrder.splice(targetIndex, 0, moved)
    onReorder(newOrder.map((j) => j.id))
    setDragIndex(null)
    setDragOverIndex(null)
  }

  if (jobs.length === 0) {
    return (
      <div className={styles.empty}>
        <p>No blend files queued yet.</p>
        <p className={styles.hint}>Click &ldquo;+ Add Blend File&rdquo; or drop a .blend file here.</p>
      </div>
    )
  }

  return (
    <div className={styles.list}>
      {jobs.map((job, index) => (
        <JobCard
          key={job.id}
          job={job}
          index={index}
          selected={job.id === selectedJobId}
          isDragging={dragIndex === index}
          isDragOver={dragOverIndex === index && dragIndex !== index}
          onSelect={() => onSelect(job.id)}
          onRemove={() => onRemove(job.id)}
          onCancel={() => onCancel(job.id)}
          onRetry={() => onRetry(job.id)}
          onOpenFolder={() => onOpenFolder(job.id)}
          onDragStart={() => setDragIndex(index)}
          onDragOver={(e) => { e.preventDefault(); setDragOverIndex(index) }}
          onDrop={() => handleDrop(index)}
          onDragEnd={() => { setDragIndex(null); setDragOverIndex(null) }}
        />
      ))}
    </div>
  )
}
