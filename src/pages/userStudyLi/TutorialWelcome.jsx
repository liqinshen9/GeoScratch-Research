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
    <div className="tutorial-welcome__picture"><span>YOUR FIRST CREATION</span><MouseHeadPicture /><p>Three spheres. One familiar face.</p></div>
    <div className="tutorial-welcome__message">
      <span className="tutorial-eyebrow">Welcome to GeoScratch</span>
      <h2 id="tutorial-welcome-title">Let’s build something.</h2>
      <p>Follow a short guide to drag, connect, and edit blocks.</p>
      <button autoFocus type="button" className="tutorial-primary" onClick={onFollow}>Follow me</button>
      <button type="button" className="tutorial-skip" onClick={onSkip}>Skip tutorial →</button>
    </div>
  </dialog>
}
