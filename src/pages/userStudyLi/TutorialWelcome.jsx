import { useEffect, useRef } from 'react'
import { MouseHeadPicture } from './SphereTutorialExercise'
import './SessionTutorial.css'

export default function TutorialWelcome({ onFollow, onSkip }) {
  const dialogRef = useRef(null)
  useEffect(() => {
    const dialog = dialogRef.current
    dialog.showModal()
    return () => dialog.close()
  }, [])
  return <dialog ref={dialogRef} className="tutorial-welcome" aria-labelledby="tutorial-welcome-title" onCancel={(event) => { event.preventDefault(); onSkip() }}>
    <header className="tutorial-welcome__header"><h2 id="tutorial-welcome-title">Welcome to GeoScratch</h2></header>
    <div className="tutorial-welcome__picture"><MouseHeadPicture showShadow={false} /><p>Build a Mickey Mouse head</p></div>
    <div className="tutorial-welcome__message">
      <p>Follow a short tutorial to drag, connect, and edit blocks.</p>
    </div>
    <footer className="tutorial-welcome__actions">
      <button type="button" className="tutorial-skip" onClick={onSkip}>Skip tutorial</button>
      <button autoFocus type="button" className="tutorial-primary" onClick={onFollow}>Follow me</button>
    </footer>
  </dialog>
}
