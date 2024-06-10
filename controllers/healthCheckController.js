const packageJson = require('../package.json'); // Supondo que o package.json está na raiz do projeto

exports.healthCheck = async (req, res) => {
    res.status(200).json({
        status: 'ok',
        version: packageJson.version
    });
};
