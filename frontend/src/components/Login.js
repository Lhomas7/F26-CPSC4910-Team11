import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

function Login() {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');

    const navigate = useNavigate();

    const handleLogin = async (e) => {
        e.preventDefault();

        setError('');

        try {
            const response = await fetch('http://localhost:8000/api/login/', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    username,
                    password,
                }),
            });

            const data = await response.json();

            if (!response.ok) {
                setError(data.error || 'Login failed');
                return;
            }

            // Save authentication token
            localStorage.setItem('token', data.token);
            localStorage.setItem('username', data.username);

            // Go to the driver page
            navigate('/drivers');
        } catch (err) {
            setError('Unable to connect to server');
        }
    };

    return (
        <div className="login-page">
            <form className="login-box" onSubmit={handleLogin}>
                <h1>Login</h1>

                {error && <p className="error">{error}</p>}

                <label>Username</label>
                <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="Enter username"
                    required
                />

                <label>Password</label>
                <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter password"
                    required
                />

                <button type="submit">
                    Login
                </button>

                <p>
                    Don't have an account?{' '}
                    <button
                        type="button"
                        className="create-account"
                    >
                        Create account
                    </button>
                </p>
            </form>
        </div>
    );
}

export default Login;
