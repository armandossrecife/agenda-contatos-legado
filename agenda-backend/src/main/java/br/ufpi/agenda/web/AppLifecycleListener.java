package br.ufpi.agenda.web;

import javax.servlet.ServletContextEvent;
import javax.servlet.ServletContextListener;
import java.sql.Driver;
import java.sql.DriverManager;
import java.sql.SQLException;
import java.util.Collections;
import java.util.logging.Level;
import java.util.logging.Logger;

/**
 * Libera recursos do driver MySQL quando a aplicação é parada ou republicada.
 *
 * <p>Sem isso, o Tomcat avisa sobre "memory leak" a cada republicação feita pelo
 * Eclipse, porque o driver fica registrado no DriverManager e a thread de limpeza
 * do Connector/J continua viva.
 */
public class AppLifecycleListener implements ServletContextListener {

    private static final Logger LOG = Logger.getLogger(AppLifecycleListener.class.getName());

    @Override
    public void contextInitialized(ServletContextEvent sce) {
        LOG.info("Agenda backend iniciado em " + sce.getServletContext().getContextPath()
                + " (Java " + System.getProperty("java.version") + ")");
    }

    @Override
    public void contextDestroyed(ServletContextEvent sce) {
        ClassLoader cl = Thread.currentThread().getContextClassLoader();
        for (Driver driver : Collections.list(DriverManager.getDrivers())) {
            if (driver.getClass().getClassLoader() == cl) {
                try {
                    DriverManager.deregisterDriver(driver);
                } catch (SQLException e) {
                    LOG.log(Level.WARNING, "Falha ao remover o driver " + driver, e);
                }
            }
        }
        com.mysql.cj.jdbc.AbandonedConnectionCleanupThread.checkedShutdown();
    }
}
