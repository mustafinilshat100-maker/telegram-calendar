import React, { useState, useEffect, useCallback } from 'react'
import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc'
import timezone from 'dayjs/plugin/timezone'
import 'dayjs/locale/ru'

dayjs.extend(utc)
dayjs.extend(timezone)
dayjs.locale('ru')
dayjs.tz.setDefault('Europe/Moscow')

// API URL - используем относительный путь для работы везде
const API_URL = ''

function App() {
  const [user, setUser] = useState(null)
  const [currentDate, setCurrentDate] = useState(dayjs.tz('Europe/Moscow'))
  const [closedDates, setClosedDates] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [initData, setInitData] = useState('')
  const [backgroundImage, setBackgroundImage] = useState(null)

  // Инициализация Telegram WebApp
  useEffect(() => {
    if (window.Telegram?.WebApp) {
      const tg = window.Telegram.WebApp
      tg.ready()
      tg.expand()
      
      setInitData(tg.initData)
      
      // Устанавливаем цвета
      tg.setHeaderColor('#0a0a0f')
      tg.setBackgroundColor('#0a0a0f')
      
      console.log('✓ Telegram WebApp initialized')
    } else {
      // Fallback для браузера (не Telegram)
      console.log('ℹ Not in Telegram WebApp, using browser mode')
      setInitData('browser_mode')
      setUser({ id: 0, username: 'browser', firstName: 'Browser', role: 'VIEWER' })
      setLoading(false)
    }
  }, [])

  // Загрузка данных пользователя
  useEffect(() => {
    if (!initData) return
    
    fetchUser()
    fetchCalendar()
    fetchSettings()
  }, [initData])

  const fetchUser = async () => {
    try {
      const response = await fetch(`${API_URL}/api/user`, {
        headers: { 'X-Telegram-Init-Data': initData }
      })
      
      if (!response.ok) throw new Error('Failed to fetch user')
      
      const data = await response.json()
      setUser(data)
      console.log('✓ User loaded:', data.role)
    } catch (err) {
      console.error('✗ User fetch error:', err)
      setError(err.message)
    }
  }

  const fetchCalendar = async () => {
    try {
      setLoading(true)
      const year = currentDate.year()
      const month = currentDate.month() + 1
      
      const response = await fetch(
        `${API_URL}/api/calendar?year=${year}&month=${month}`,
        { headers: { 'X-Telegram-Init-Data': initData } }
      )
      
      if (!response.ok) throw new Error('Failed to fetch calendar')
      
      const data = await response.json()
      setClosedDates(data.closedDates.map(d => d.date))
      setLoading(false)
      console.log('✓ Calendar loaded:', data.closedDates.length, 'closed dates')
    } catch (err) {
      console.error('✗ Calendar fetch error:', err)
      setError(err.message)
      setLoading(false)
    }
  }

  const fetchSettings = async () => {
    try {
      const response = await fetch(`${API_URL}/api/settings`, {
        headers: { 'X-Telegram-Init-Data': initData }
      })
      
      if (response.ok) {
        const data = await response.json()
        setBackgroundImage(data.backgroundImage)
        console.log('✓ Settings loaded')
      }
    } catch (err) {
      console.error('✗ Settings fetch error:', err)
    }
  }

  const toggleDate = async (date) => {
    if (!canManageDates()) return
    
    try {
      const dateStr = date.format('YYYY-MM-DD')
      
      const response = await fetch(`${API_URL}/api/calendar/toggle`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Telegram-Init-Data': initData
        },
        body: JSON.stringify({ date: dateStr })
      })
      
      if (!response.ok) throw new Error('Failed to toggle date')
      
      const data = await response.json()
      
      if (data.status === 'closed') {
        setClosedDates(prev => [...prev, dateStr])
        console.log('✓ Date closed:', dateStr)
      } else {
        setClosedDates(prev => prev.filter(d => d !== dateStr))
        console.log('✓ Date opened:', dateStr)
      }
    } catch (err) {
      console.error('✗ Toggle date error:', err)
      setError(err.message)
    }
  }

  const canManageDates = () => {
    return user?.role === 'ADMIN' || user?.role === 'OWNER'
  }

  const prevMonth = () => {
    setCurrentDate(prev => prev.subtract(1, 'month'))
  }

  const nextMonth = () => {
    setCurrentDate(prev => prev.add(1, 'month'))
  }

  // Перезагрузка календаря при смене месяца
  useEffect(() => {
    if (initData) fetchCalendar()
  }, [currentDate])

  const generateCalendarDays = () => {
    const startOfMonth = currentDate.startOf('month')
    const endOfMonth = currentDate.endOf('month')
    const startDay = startOfMonth.day() || 7
    const daysInMonth = endOfMonth.date()
    const today = dayjs.tz('Europe/Moscow').startOf('day')
    
    const days = []
    
    // Пустые дни в начале
    for (let i = 1; i < startDay; i++) {
      days.push({ type: 'empty', key: `empty-${i}` })
    }
    
    // Дни месяца
    for (let i = 1; i <= daysInMonth; i++) {
      const date = currentDate.date(i)
      const dateStr = date.format('YYYY-MM-DD')
      const isPast = date.isBefore(today)
      const isClosed = closedDates.includes(dateStr)
      const isToday = date.isSame(today, 'day')
      
      days.push({
        type: 'day',
        day: i,
        date,
        dateStr,
        isPast,
        isClosed,
        isToday,
        key: dateStr
      })
    }
    
    return days
  }

  const weekDays = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']

  if (loading && !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-dark-900 via-dark-800 to-dark-700">
        <div className="text-center">
          <div className="loader mx-auto mb-4"></div>
          <p className="text-gray-400">Загрузка...</p>
        </div>
      </div>
    )
  }

  return (
    <div 
      className="min-h-screen p-4"
      style={backgroundImage ? {
        backgroundImage: `linear-gradient(rgba(10, 10, 15, 0.85), rgba(10, 10, 15, 0.9)), url(${backgroundImage})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundAttachment: 'fixed'
      } : {
        background: 'linear-gradient(135deg, #0a0a0f 0%, #12121a 50%, #1a1a25 100%)',
        backgroundAttachment: 'fixed'
      }}
    >
      <div className="max-w-md mx-auto">
        {/* Заголовок */}
        <div className="text-center mb-6 animate-fade-in">
          <h1 className="text-2xl font-bold text-white mb-2">Календарь</h1>
          <p className="text-sm text-gray-400">
            {currentDate.format('MMMM YYYY')}
          </p>
          
          {user && (
            <div className="mt-2 text-xs">
              <span className="px-2 py-1 rounded bg-dark-700 text-gray-300">
                {user.role === 'OWNER' && '👑 Владелец'}
                {user.role === 'ADMIN' && '⚙️ Администратор'}
                {user.role === 'VIEWER' && '👁️ Просмотр'}
              </span>
            </div>
          )}
        </div>

        {/* Навигация */}
        <div className="flex justify-between items-center mb-6">
          <button
            onClick={prevMonth}
            className="p-3 rounded-full bg-dark-700 hover:bg-dark-600 transition-all hover:scale-110"
            title="Предыдущий месяц"
          >
            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          
          <span className="text-lg font-semibold text-white">
            {currentDate.format('MMMM YYYY')}
          </span>
          
          <button
            onClick={nextMonth}
            className="p-3 rounded-full bg-dark-700 hover:bg-dark-600 transition-all hover:scale-110"
            title="Следующий месяц"
          >
            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>

        {/* Ошибка */}
        {error && (
          <div className="mb-4 p-3 rounded-lg bg-red-900/30 border border-red-500/30 text-red-400 text-sm">
            ⚠️ {error}
          </div>
        )}

        {/* Легенда */}
        <div className="flex justify-center gap-4 mb-4 text-xs">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-dark-700 border border-accent-cyan"></div>
            <span className="text-gray-400">Открыто</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-dark-700 border border-accent-red"></div>
            <span className="text-gray-400">Закрыто</span>
          </div>
        </div>

        {/* Дни недели */}
        <div className="calendar-grid mb-2">
          {weekDays.map(day => (
            <div key={day} className="text-center text-xs font-semibold text-gray-500 py-2">
              {day}
            </div>
          ))}
        </div>

        {/* Календарь */}
        <div className="calendar-grid">
          {generateCalendarDays().map(item => {
            if (item.type === 'empty') {
              return <div key={item.key} className="calendar-day disabled"></div>
            }
            
            return (
              <button
                key={item.key}
                onClick={() => !item.isPast && toggleDate(item.date)}
                disabled={item.isPast || !canManageDates()}
                className={`
                  calendar-day
                  ${item.isClosed ? 'closed' : 'open'}
                  ${item.isPast ? 'past' : ''}
                  ${item.isToday ? 'today' : ''}
                  ${canManageDates() && !item.isPast ? 'cursor-pointer' : 'cursor-default'}
                `}
                title={item.isPast ? 'Прошедшая дата' : canManageDates() ? 'Нажмите для переключения' : 'Нет доступа'}
              >
                {item.day}
              </button>
            )
          })}
        </div>

        {/* Подсказка */}
        <div className="mt-6 text-center text-xs text-gray-500">
          {canManageDates() ? (
            <p>Нажмите на дату, чтобы открыть или закрыть</p>
          ) : (
            <p>У вас доступ только для просмотра</p>
          )}
          <p className="mt-1">🕐 Московское время (MSK)</p>
        </div>
      </div>
    </div>
  )
}

export default App
