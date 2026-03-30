import { supabase } from './supabase'

// ── AUTH ─────────────────────────────────────────────────────────────────────
export const authAPI = {
  register: async ({ name, email, password, phone, role, skills = [] }) => {
    const { data, error } = await supabase.auth.signUp({
      email, password,
      options: { 
        data: { name, phone, role, skills },
        emailRedirectTo: window.location.origin
      }
    })
    if (error) throw error
    return data
  },
  login: async ({ email, password }) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
    return data
  },
  logout: async () => {
    const { error } = await supabase.auth.signOut()
    if (error) throw error
  },
  getSession: () => supabase.auth.getSession(),
  onAuthStateChange: (cb) => supabase.auth.onAuthStateChange(cb),
}

// ── PROFILES ─────────────────────────────────────────────────────────────────
export const profileAPI = {
  get: async (id) => {
    const { data, error } = await supabase.from('profiles').select('*').eq('id', id).single()
    if (error) throw error
    return data
  },
  update: async (id, updates) => {
    const { data, error } = await supabase.from('profiles').update(updates).eq('id', id).select().single()
    if (error) throw error
    return data
  },
}

// ── JOBS ─────────────────────────────────────────────────────────────────────
export const jobsAPI = {
  getAll: async ({ category, search } = {}) => {
    let q = supabase
      .from('jobs')
      .select('*, employer:profiles!employer_id(id,name,phone,rating), applications(id)')
      .eq('status', 'open')
      .order('created_at', { ascending: false })
    if (category && category !== 'All') q = q.eq('category', category)
    if (search) q = q.or(`title.ilike.%${search}%,description.ilike.%${search}%,location.ilike.%${search}%`)
    const { data, error } = await q
    if (error) throw error
    return data
  },

  getById: async (id) => {
    const { data, error } = await supabase
      .from('jobs')
      .select('*, employer:profiles!employer_id(id,name,phone,rating), applications(id,worker_id,status,worker:profiles!worker_id(id,name,phone,skills,rating))')
      .eq('id', id).single()
    if (error) throw error
    return data
  },

  getMyJobs: async () => {
    const { data: { user } } = await supabase.auth.getUser()
    const { data, error } = await supabase
      .from('jobs')
      .select('*, applications(id,status,applied_at,worker:profiles!worker_id(id,name,phone,skills,rating))')
      .eq('employer_id', user.id)
      .order('created_at', { ascending: false })
    if (error) throw error
    return data
  },

  getApplications: async () => {
    const { data: { user } } = await supabase.auth.getUser()
    const { data, error } = await supabase
      .from('applications')
      .select('id,status,applied_at,job:jobs(id,title,description,budget,category,location,status,employer:profiles!employer_id(name,phone))')
      .eq('worker_id', user.id)
      .order('applied_at', { ascending: false })
    if (error) throw error
    return data
  },

  create: async (jobData) => {
    const { data: { user } } = await supabase.auth.getUser()
    const { data, error } = await supabase
      .from('jobs').insert({ ...jobData, employer_id: user.id }).select().single()
    if (error) throw error
    return data
  },

  apply: async (jobId) => {
    const { data: { user } } = await supabase.auth.getUser()
    const { data, error } = await supabase
      .from('applications').insert({ job_id: jobId, worker_id: user.id }).select().single()
    if (error) throw error
    return data
  },

  hasApplied: async (jobId) => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return false
    const { data } = await supabase
      .from('applications').select('id').eq('job_id', jobId).eq('worker_id', user.id).maybeSingle()
    return !!data
  },

  updateApplicationStatus: async (appId, status) => {
    const { data, error } = await supabase
      .from('applications').update({ status }).eq('id', appId).select().single()
    if (error) throw error
    return data
  },

  close: async (jobId) => {
    const { data, error } = await supabase
      .from('jobs').update({ status: 'closed' }).eq('id', jobId).select().single()
    if (error) throw error
    return data
  },
}

// ── NOTIFICATIONS ─────────────────────────────────────────────────────────────
export const notificationsAPI = {
  getAll: async () => {
    const { data: { user } } = await supabase.auth.getUser()
    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(50)
    if (error) throw error
    return data
  },

  getUnreadCount: async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return 0
    const { count, error } = await supabase
      .from('notifications')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('read', false)
    if (error) return 0
    return count ?? 0
  },

  markRead: async (id) => {
    const { error } = await supabase
      .from('notifications').update({ read: true }).eq('id', id)
    if (error) throw error
  },

  markAllRead: async () => {
    const { data: { user } } = await supabase.auth.getUser()
    await supabase.rpc('mark_all_notifications_read', { p_user_id: user.id })
  },

  // Realtime subscription
  subscribe: (userId, callback) => {
    return supabase
      .channel(`notifications:${userId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'notifications',
        filter: `user_id=eq.${userId}`,
      }, callback)
      .subscribe()
  },

  unsubscribe: (channel) => supabase.removeChannel(channel),
}

// ── PAYMENTS (M-Pesa) ─────────────────────────────────────────────────────────
export const paymentsAPI = {
  // Initiate STK Push — calls Supabase Edge Function
  initiate: async ({ jobId, phone, amount, workerId }) => {
    const { data, error } = await supabase.functions.invoke('mpesa-stk-push', {
      body: { jobId, phone, amount, workerId }
    })
    if (error) throw new Error(error.message || 'Payment initiation failed')
    if (data?.error) throw new Error(data.error)
    return data
  },

  // Poll transaction status
  getStatus: async (checkoutId) => {
    const { data, error } = await supabase
      .from('transactions')
      .select('*, job:jobs(title), worker:profiles!worker_id(name,phone)')
      .eq('mpesa_checkout_id', checkoutId)
      .single()
    if (error) throw error
    return data
  },

  // Simulate a payment locally (for dev when Edge Function isn't deployed)
  simulate: async ({ jobId, phone, amount, workerId }) => {
    const { data: { user } } = await supabase.auth.getUser()
    const receiptNo = 'SIM' + Math.random().toString(36).slice(2, 10).toUpperCase()
    const checkoutId = 'SIMCHK_' + Date.now()

    const { data, error } = await supabase
      .from('transactions')
      .insert({
        job_id: jobId,
        employer_id: user.id,
        worker_id: workerId,
        amount,
        phone,
        worker_phone: phone,
        mpesa_checkout_id: checkoutId,
        mpesa_receipt_number: receiptNo,
        status: 'success',
        completed_at: new Date().toISOString(),
      })
      .select().single()
    if (error) throw error

    // Mark job completed
    await supabase.from('jobs').update({ status: 'completed' }).eq('id', jobId)

    // Update worker stats
    await supabase.rpc('increment_worker_stats', { p_worker_id: workerId, p_amount: amount })

    return { simulated: true, receipt: receiptNo, transaction: data }
  },

  getHistory: async () => {
    const { data: { user } } = await supabase.auth.getUser()
    const { data, error } = await supabase
      .from('transactions')
      .select('*, job:jobs(title), worker:profiles!worker_id(name,phone)')
      .eq('employer_id', user.id)
      .order('created_at', { ascending: false })
    if (error) throw error
    return data
  },
}
