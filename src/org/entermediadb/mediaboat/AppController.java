package org.entermediadb.mediaboat;

import java.awt.Dimension;
import java.awt.Toolkit;
import java.net.URI;
import java.util.Collection;

import javax.swing.JFrame;
import javax.swing.JOptionPane;

import org.entermediadb.mediaboat.components.LoginForm;
import org.entermediadb.utils.ExecutorManager;
import org.json.simple.JSONObject;

public class AppController implements LogListener
{
	EnterMediaModel model;//
	LoginForm fieldLoginForm;
	ExecutorManager fieldExecutorManager;
	
	public ExecutorManager getExecutorManager()
	{
		if (fieldExecutorManager == null)
		{
			fieldExecutorManager = new ExecutorManager();
		}

		return fieldExecutorManager;
	}

	public void setExecutorManager(ExecutorManager inExecutorManager)
	{
		fieldExecutorManager = inExecutorManager;
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
			URI uri = new URI(url);
			
			WsConnection connection = new WsConnection(uri);
			connection.setAppController(this);
			connection.connect();
			getModel().setConnection(connection);
			// more about drafts here: http://github.com/TooTallNate/Java-WebSocket/wiki/Drafts
			return getModel().login(uri, server,inUname,inPass);
		}
		catch( Exception ex)
		{
			reportError("Could not connect" , ex);
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
	public void download(JSONObject inMap)
	{
		Collection datapaths = (Collection)inMap.get("assetpaths");
		String subfolder = (String)inMap.get("path");
		getModel().download(subfolder, datapaths);
		
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
						getModel().checkinFiles(inMap);						
					}
				});
	}

	public void loginComplete(String inValue)
	{
		// TODO Auto-generated method stub
		getModel().loginComplete(inValue);
				
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
		return false;
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
}
