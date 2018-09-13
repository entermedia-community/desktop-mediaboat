package org.entermediadb.mediaboat;

import java.awt.Dimension;
import java.awt.Toolkit;
import java.io.File;
import java.net.URI;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Map;
import java.util.Timer;
import java.util.TimerTask;

import javax.swing.JFrame;
import javax.swing.JOptionPane;

import org.entermediadb.mediaboat.components.LoginForm;
import org.entermediadb.utils.Exec;
import org.entermediadb.utils.ExecutorManager;
import org.entermediadb.utils.WhatOs;
import org.json.simple.JSONObject;

public class AppController implements LogListener
{
	EnterMediaModel model;//
	LoginForm fieldLoginForm;
    Timer timer = null;
	WhatOs OS = new WhatOs();
	Exec exec = new Exec();
	public ExecutorManager getExecutorManager()
	{
		return exec.getExecutorManager();
	}

	
	public LoginForm getLoginForm()
	{
		return fieldLoginForm;
	}

	public void setLoginForm(LoginForm inLoginForm)
	{
		fieldLoginForm = inLoginForm;
	}

	public EnterMediaModel getModel()
	{
		if (model == null)
		{
			model = new EnterMediaModel();
			model.setLogListener(this);
		}
		return model;
	}
	
	
	
	public Configuration getConfig()
	{
		return getModel().getConfig();
	}
	public boolean connect(String server, String inUname, String inPass)
	{
		try
		{
//			if( getModel().getConnection() != null && getModel().getConnection().isClosing() )
//			{
//				//return false;
//				getModel().getConnection().disconnect();
//				getModel().setConnection(null);
//			}
			int i;
			if ((i = server.indexOf("/", 8)) > -1)
			{
				//strip off /s
				server = server.substring(0, i);
			}
			String prefix = server.substring(server.lastIndexOf("/") + 1);

			String url = "ws://" + prefix + "/entermedia/services/websocket/org/entermediadb/websocket/mediaboat/MediaBoatConnection";
			url = url + "?userid=" + getModel().getUserId();
			debug("Connecting to:" + url);
			URI uri = new URI(url);
			
			WsConnection connection = new WsConnection(uri);
			connection.setAppController(this);
			if( !connection.connect() )
			{
				debug("Could not connect");
				return false;
			}
			debug("Connected ok");
			getModel().setConnection(connection);
			// more about drafts here: http://github.com/TooTallNate/Java-WebSocket/wiki/Drafts
			return getModel().login(uri, server,inUname,inPass);
		}
		catch( Exception ex)
		{
			reportError("Could not connect" , ex);
			ex.printStackTrace();
		}
		//Send client info
		return false;
	}
	public void reportError(String inString, Throwable inEx)
	{
		getLoginForm().reportError(inString, inEx);
	}
	public void info(String inString)
	{
		getLoginForm().info(inString);
	}
	public void downloadFolders(Map inRoot)
	{
		getModel().downloadFolders( inRoot);
	}
	
	//has connection
	//has UI
	//has API
	public void logoff()
	{
		getModel().disconnect();
		System.exit(0);
		
	}
	

	public void checkinFiles(final JSONObject inMap)
	{
		//Invoke later
		getExecutorManager().execute(new Runnable()
				{
					public void run()
					{
						try
						{
							getModel().checkinFiles(inMap);
						}
						finally
						{
							getModel().busy(false);
						}
					}
				});
	}

	public void loginComplete(String inValue)
	{
		getModel().loginComplete(inValue);
		info("Login complete");
	}

	public boolean reconnect()
	{
		// 
		info("Reconnecting");
		if( getModel().getConnection() != null)
		{
			getModel().getConnection().disconnect();
		}
		String user = getConfig().get("username");
		String server = getConfig().get("server");
		//check  for key
		String key = getConfig().get("entermedia.key");
		if( connect(server, user, key))
		{
			return true;
		}
		//Try again in a while?
		
		loginLater();
		
		return false;
	}

	public void loginLater() {
	    // Do your startup work here

		if( timer == null)
		{
			timer = new Timer();
		}

	    TimerTask delayedThreadStartTask = new TimerTask() {
	        @Override
	        public void run() 
	        {
	        	reconnect();
	        
	        }
	    };

	    timer.schedule(delayedThreadStartTask, 60 * 1000); //1 minute
	}
	
	public void loginFailed(String inValue)
	{
		JOptionPane.showMessageDialog(getLoginForm(), inValue, "Error", JOptionPane.ERROR_MESSAGE);
		createAndShowGUI();
	}

	public void disconnect(JSONObject inMap)
	{
		//Close connection
		createAndShowGUI();
	}
	
	  protected void createAndShowGUI() {
	        //Make sure we have nice window decorations.
	        JFrame.setDefaultLookAndFeelDecorated(false);

	        //Create and set up the window.
	        
	        if( getLoginForm() != null)
	        {
	        	getLoginForm().hide();
	        }
	        //Display the window.
	        LoginForm frame = new LoginForm();
	        
	        setLoginForm(frame);
	        frame.setAppController(this);
	        frame.setLogListener(this);
	        frame.initContentPanel();
	        frame.setSize(600, 300);
	        Dimension screenSize = Toolkit.getDefaultToolkit().getScreenSize();
	        int centerX = screenSize.width/2 - frame.getWidth();
	        int centerY = screenSize.height/2 - frame.getHeight();
	        frame.setLocation(centerX, centerY);
	        
	    }

	public void init()
	{
		createAndShowGUI();
	}
	
	public void cmdOpenFolder(JSONObject inMap)
	{
		String path = (String)inMap.get("fullpath");
		openFolder(path);
			
	}


	protected void openFolder(String path)
	{
		if( OS.isWindows() )
		{
			path = path.replace("/", File.pathSeparator);
		}
		File folder = new File(path);
		folder.mkdirs();
		Collection args = new ArrayList();
		args.add(path);
		if( OS.isMac() )
		{
			exec.runExec("open", args);
		}
		else if( OS.isUnix() )
		{
			exec.runExec("xdg-open", args);
		}
		else if( OS.isWindows() )
		{
			exec.runExec("start", args);
		}
	}

	public void debug(String inString)
	{
		if( isDebug() )
		{
			getLoginForm().info("Debug: " + inString);
		}
		else
		{
			System.out.println(inString);
		}
	}


	protected boolean isDebug()
	{
		return getModel().getServer().startsWith("http:");
	}
}
