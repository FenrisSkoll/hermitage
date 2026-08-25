import { Star } from 'lucide-react'

export function StarRating({ value = 0, onChange, size = 17, disabled = false, label = 'Rating' }: {
  value?: number
  onChange?: (value: number) => void
  size?: number
  disabled?: boolean
  label?: string
}) {
  return (
    <div className="star-rating" aria-label={`${label}: ${value || 0} out of 5`}>
      {[1, 2, 3, 4, 5].map((rating) => (
        <button
          key={rating}
          type="button"
          disabled={disabled || !onChange}
          className={rating <= value ? 'is-active' : ''}
          onClick={() => onChange?.(rating === value ? 0 : rating)}
          title={`${rating} star${rating === 1 ? '' : 's'}`}
        >
          <Star size={size} fill={rating <= value ? 'currentColor' : 'none'} />
        </button>
      ))}
    </div>
  )
}
