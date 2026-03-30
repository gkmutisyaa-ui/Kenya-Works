import { Link, NavLink } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import NotificationBell from './NotificationBell'

export default function Navbar() {
  const { user, logout } = useAuth()

  return (
    <nav className="top-nav">
      <div className="top-nav-inner">
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <Link to="/" className="logo"><span className="logo-dot" />KenyaWorks</Link>
          
          {user && (
            <div className="nav-links">
              <NavLink to="/dashboard">Dashboard</NavLink>
              {user.role === 'employer' ? (
                <>
                  <NavLink to="/post-job">Post Job</NavLink>
                  <NavLink to="/my-jobs">My Jobs</NavLink>
                </>
              ) : (
                <>
                  <NavLink to="/jobs">Browse Jobs</NavLink>
                  <NavLink to="/applications">My Applications</NavLink>
                </>
              )}
              <NavLink to="/profile">Profile</NavLink>
            </div>
          )}
        </div>

        <div className="nav-right">
          {user ? (
            <>
              <span className={`role-chip ${user.role}`}>{user.role}</span>
              <NotificationBell />
              <button className="btn btn-sm btn-ghost" onClick={logout}>Logout</button>
            </>
          ) : (
            <>
              <Link to="/login" className="btn btn-sm">Log in</Link>
              <Link to="/register" className="btn btn-sm btn-primary">Sign up</Link>
            </>
          )}
        </div>
      </div>
    </nav>
  )
}

