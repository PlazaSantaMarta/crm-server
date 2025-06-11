const User = require('../models/User');
const { KommoAuthService } = require('./kommoService');
const GeneratorLeadsService = require('./generatorLeads');

// Objeto para almacenar las instancias de servicios por usuario
const userServices = new Map();

class AuthService {
    async register(userData) {
        try {
            const existingUser = await User.findOne({ username: userData.username });
            if (existingUser) {
                throw new Error('El nombre de usuario ya existe');
            }

            const user = new User({
                username: userData.username,
                password: userData.password,
                kommo_credentials: {
                    client_secret: userData.kommo_client_secret,
                    client_id: userData.kommo_client_id,
                    redirect_uri: userData.kommo_redirect_uri,
                    base_url: userData.kommo_base_url,
                    auth_token: userData.kommo_auth_token
                }
            });

            await user.save();
            
            return {
                success: true,
                user: {
                    id: user._id,
                    username: user.username,
                    kommo_credentials: user.kommo_credentials
                }
            };
        } catch (error) {
            throw error;
        }
    }

    async login(username, password) {
        try {
            console.log('\n🔐 Iniciando proceso de autenticación...');
            console.log(`👤 Usuario: ${username}`);

            const user = await User.findOne({ username });
            if (!user) {
                console.log('❌ Usuario no encontrado');
                throw new Error('Usuario no encontrado');
            }

            const isValidPassword = await user.comparePassword(password);
            if (!isValidPassword) {
                console.log('❌ Contraseña incorrecta');
                throw new Error('Contraseña incorrecta');
            }

            // Usar una única operación atómica para actualizar todos los usuarios
            await User.bulkWrite([
                {
                    updateMany: {
                        filter: { _id: { $ne: user._id } },
                        update: { $set: { logged: false } }
                    }
                },
                {
                    updateOne: {
                        filter: { _id: user._id },
                        update: { $set: { logged: true } }
                    }
                }
            ]);

            // Recargar el usuario para obtener el estado actualizado
            const updatedUser = await User.findById(user._id);
            
            console.log('\n✅ Autenticación exitosa');
            console.log(`📝 Datos del usuario ${username}:`);
            console.log(`   - ID: ${updatedUser._id}`);
            console.log(`   - Nombre de usuario: ${username}`);
            console.log(`   - Cuenta Kommo: ${updatedUser.kommo_credentials.base_url}`);

            // Limpiar servicios anteriores para este usuario
            if (userServices.has(updatedUser._id.toString())) {
                console.log('🧹 Limpiando servicios anteriores');
                userServices.delete(updatedUser._id.toString());
            }

            // Inicializar nuevos servicios para este usuario
            const kommoService = new KommoAuthService(updatedUser.kommo_credentials);
            const generatorLeads = new GeneratorLeadsService(updatedUser.kommo_credentials);
            
            // Verificar conexión con Kommo
            const kommoStatus = await kommoService.verifyAndInitialize();

            // Guardar las nuevas instancias
            userServices.set(updatedUser._id.toString(), {
                kommoService,
                generatorLeads,
                credentials: updatedUser.kommo_credentials,
                lastUpdated: new Date()
            });

            console.log('✨ Servicios inicializados correctamente');

            const userData = updatedUser.toObject();
            delete userData.password;

            return {
                success: true,
                user: userData,
                kommo_status: kommoStatus
            };
        } catch (error) {
            console.error('❌ Error en login:', error);
            throw error;
        }
    }

    async getUserServices(userId) {
        console.log('\n🔍 Buscando servicios para usuario:', userId);
        const services = userServices.get(userId.toString());
        
        if (!services) {
            console.log('❌ No se encontraron servicios inicializados');
            throw new Error('Servicios no inicializados para este usuario');
        }
        
        // Verificar la antigüedad de los servicios
        const now = new Date();
        const serviceAge = now - services.lastUpdated;
        const MAX_SERVICE_AGE = 30 * 60 * 1000; // 30 minutos
        
        if (serviceAge > MAX_SERVICE_AGE) {
            console.log('⚠️ Servicios expirados, reinicializando...');
            // Obtener usuario actualizado
            const user = await User.findById(userId);
            if (!user) {
                throw new Error('Usuario no encontrado');
            }
            
            // Reinicializar servicios
            const kommoService = new KommoAuthService(user.kommo_credentials);
            const generatorLeads = new GeneratorLeadsService(user.kommo_credentials);
            
            // Actualizar servicios en el Map
            userServices.set(userId.toString(), {
                kommoService,
                generatorLeads,
                credentials: user.kommo_credentials,
                lastUpdated: now
            });
            
            return { kommoService, generatorLeads };
        }
        
        console.log('✅ Servicios encontrados y válidos');
        return { kommoService: services.kommoService, generatorLeads: services.generatorLeads };
    }

    async getUserData(userId) {
        try {
            const user = await User.findById(userId).select('-password');
            if (!user) {
                throw new Error('Usuario no encontrado');
            }
            return user;
        } catch (error) {
            throw error;
        }
    }

    async logout(userId) {
        try {
            console.log('\n🔒 Iniciando proceso de cierre de sesión...');
            
            // Buscar el usuario
            const user = await User.findById(userId);
            if (!user) {
                throw new Error('Usuario no encontrado');
            }

            console.log(`👤 Cerrando sesión del usuario: ${user.username}`);

            // Marcar como deslogueado
            user.logged = false;
            await user.save();

            // Limpiar servicios
            if (userServices.has(userId.toString())) {
                console.log('🧹 Limpiando servicios del usuario');
                userServices.delete(userId.toString());
            }

            // Verificar que se guardó correctamente
            const verifyUser = await User.findById(userId);
            if (verifyUser.logged) {
                throw new Error('Error al guardar el estado de logout del usuario');
            }

            console.log('✅ Sesión cerrada exitosamente');
            return {
                success: true,
                message: 'Sesión cerrada exitosamente'
            };
        } catch (error) {
            console.error('❌ Error en logout:', error);
            throw error;
        }
    }
}

module.exports = new AuthService(); 