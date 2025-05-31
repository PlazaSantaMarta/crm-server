const axios = require('axios');

class KommoError extends Error {
    constructor(message, details = {}) {
        super(message);
        this.name = 'KommoError';
        this.details = details;
    }
}

class KommoAuthService {
    constructor(userCredentials = null) {
        console.log('\n📦 Iniciando KommoAuthService');
        
        // Inicializar propiedades de instancia
        this.clientId = "";
        this.clientSecret = "";
        this.redirectUri = "";
        this.domain = "";
        this.currentSession = null;
        this.axiosInstance = null;
        
        if (userCredentials) {
            console.log('✨ Credenciales recibidas del usuario:');
            console.log(JSON.stringify(userCredentials, null, 2));
            this.setupFromUserCredentials(userCredentials);
        } else {
            console.log('⚠️ No se recibieron credenciales');
        }
    }

    setupFromUserCredentials(credentials) {
        console.log('\n🔄 Configurando Kommo con credenciales del usuario...');
        
        // Validar credenciales requeridas
        const requiredFields = ['client_id', 'client_secret', 'redirect_uri', 'base_url', 'auth_token'];
        const missingFields = requiredFields.filter(field => !credentials[field]);
        
        if (missingFields.length > 0) {
            console.error('❌ Faltan campos requeridos:', missingFields);
            throw new KommoError(`Faltan campos requeridos: ${missingFields.join(', ')}`);
        }

        try {
            this.clientId = credentials.client_id;
            this.clientSecret = credentials.client_secret;
            this.redirectUri = credentials.redirect_uri;
            this.domain = credentials.base_url;
            
            // Configurar la sesión actual con el token existente
            this.currentSession = {
                access_token: credentials.auth_token,
                base_domain: this.domain,
                account_id: null,
                token_created_at: Date.now()
            };

            console.log('\n📝 Configuración establecida:');
            console.log('   Variables de entorno:');
            console.log(`   - Client ID: ${this.clientId}`);
            console.log(`   - Redirect URI: ${this.redirectUri}`);
            
            console.log('\n   Configuración de dominio:');
            console.log(`   - Dominio original: ${credentials.base_url}`);
            console.log(`   - Dominio procesado: ${this.domain}`);
            console.log(`   - Dominio completo: ${this.domain}`);
            
            // Configurar cliente Axios
            this.setupAxiosClient();
        } catch (error) {
            throw new KommoError('Error al configurar credenciales', { originalError: error.message });
        }
    }

    setupAxiosClient() {
        console.log('\n🔧 Configurando cliente Axios:');
        console.log(`   - URL Base: ${this.domain}`);
        console.log(`   - Timeout: 15000ms`);

        this.axiosInstance = axios.create({
            baseURL: this.domain,
            timeout: 15000,
            headers: {
                'Authorization': `Bearer ${this.currentSession.access_token}`,
                'Content-Type': 'application/json'
            }
        });

        console.log('✅ Cliente Axios configurado correctamente');
    }

    async verifyAndInitialize() {
        try {
            console.log('\n🔍 Verificando conexión con Kommo...');
            
            // Verificar el token actual
            const response = await this.axiosInstance.get('/api/v4/account');
            console.log(response)

            if (response.data && response.data._embedded && response.data._embedded.account) {
                const account = response.data._embedded.account;
                this.currentSession.account_id = account.id;
                
                console.log('\n✅ Conexión exitosa!');
                console.log('📊 Detalles de la cuenta:');
                console.log(`   - Nombre: ${account.name}`);
                console.log(`   - ID: ${account.id}`);
                console.log(`   - Creada: ${new Date(account.created_at * 1000).toLocaleString()}`);
                console.log('\n🚀 Kommo listo para usar\n');

                return {
                    success: true,
                    account: response.data
                };
            }
        } catch (error) {
            console.error('\n❌ Error al verificar conexión con Kommo');
            console.error(`   - Error: ${error.response?.data?.message || error.message}`);
            
            // Si el token es inválido, necesitamos obtener uno nuevo
            if (error.response?.status === 401) {
                try {
                    const newTokens = await this.refreshAccessToken();
                    // Actualizar el token en la sesión actual
                    this.currentSession.access_token = newTokens.access_token;
                    this.setupAxiosClient();
                } catch (refreshError) {
                    throw new KommoError('Error al renovar el token de acceso', {
                        originalError: refreshError.message,
                        details: refreshError.response?.data || {}
                    });
                }
            }
            
            throw new KommoError('Error al verificar conexión con Kommo', {
                originalError: error.message,
                details: error.response?.data || {}
            });
        }
    }

    async refreshAccessToken() {
        try {
            const response = await axios.post(`${this.domain}/oauth2/access_token`, {
                client_id: this.clientId,
                client_secret: this.clientSecret,
                grant_type: 'refresh_token',
                redirect_uri: this.redirectUri
            });

            return {
                access_token: response.data.access_token,
                refresh_token: response.data.refresh_token,
                expires_in: response.data.expires_in
            };
        } catch (error) {
            throw new KommoError('Error al renovar el token de acceso', {
                originalError: error.message,
                details: error.response?.data || {}
            });
        }
    }

    getAuthorizationUrl() {
        if (!this.domain) {
            throw new KommoError('Dominio no configurado');
        }

        const params = new URLSearchParams({
            client_id: this.clientId,
            mode: 'post_message',
            redirect_uri: this.redirectUri,
            scope: 'crm',
            state: this.domain,
            response_type: 'code'
        });

        return `${this.domain}/oauth2/authorize?${params.toString()}`;
    }

    getCurrentSession() {
        return this.currentSession;
    }
}

module.exports = { KommoAuthService }; 