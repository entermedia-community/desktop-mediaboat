package org.entermediadb.mediaboat;

import java.awt.Dimension;
import java.awt.Image;
import java.awt.Toolkit;
import java.io.File;
import java.io.IOException;
import java.io.StringReader;
import java.net.URI;
import java.net.URL;
import java.util.ArrayList;
import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.Timer;
import java.util.TimerTask;

import javax.imageio.ImageIO;
import javax.swing.JFrame;
import javax.swing.JOptionPane;

import org.entermediadb.mediaboat.components.LoginForm;
import org.entermediadb.utils.Exec;
import org.entermediadb.utils.ExecutorManager;
import org.entermediadb.utils.WhatOs;
import org.json.simple.JSONObject;

import com.neovisionaries.ws.client.WebSocket;

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
	public boolean connect(String server, String inUname, String inKey)
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
			if( server.startsWith("https"))
			{
				prefix = "wss://" + prefix;
			}
			else
			{
				prefix = "ws://" + prefix;
			}
			String url = prefix + "/entermedia/services/websocket/org/entermediadb/websocket/mediaboat/MediaBoatConnection";
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
			return getModel().login(uri, server,inUname,inKey);
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
		if( isDebug() )
		{
			getLoginForm().info("Error: " + inString);
		}
		else
		{
			System.out.println(inString);
			inEx.printStackTrace();
			
		}
	}
	public void info(String inString)
	{
		if( isDebug() )
		{
			getLoginForm().info("Info: " + inString);
		}
		else
		{
			System.out.println(inString);
		}
	}
	public void downloadFolders(Map inRoot)
	{
		getModel().downloadFolders( inRoot);
		String rootname = (String)inRoot.get("rootname");
		String path = getModel().getWorkFolder() + "/" + rootname;
		openAbsPath(path);
	}
	
	public void cmdOpenFolder(JSONObject inMap)
	{
		String path = (String)inMap.get("abspath");
		openAbsPath(path);
			
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

	public void loginComplete(String inEnterMediaKey)
	{
		getModel().loginComplete(inEnterMediaKey);
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
	public void renewKeyLater() 
	{
		if( timer == null)
		{
			timer = new Timer();
		}

	    TimerTask delayedThreadStartTask = new TimerTask() {
	        @Override
	        public void run() 
	        {
	        	getModel().renewKeyNow();
	        }
	    };
	    
	    timer.schedule(delayedThreadStartTask, 1000 * 60 * 60 * 10); //every 10 hours
		
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
	        
	        try {
		        URL ICON20 = getClass().getResource("/em20.png");
		        URL ICON40 = getClass().getResource("/em40.png");
		        URL ICONBIG = getClass().getResource("/EMLogo.png");
		        List<Image> images = new ArrayList<Image>();
	            images.add(ImageIO.read(ICONBIG));
	            images.add(ImageIO.read(ICON40));
	            images.add(ImageIO.read(ICON20));
	            //https://stackoverflow.com/questions/18224184/sizes-of-frame-icons-used-in-swing
	           // images.add(ImageIO.read(ICON16));
		        frame.setIconImages(images);	        
	        } catch (Exception e) {
	            
	        }
	        //https://stackoverflow.com/questions/11253772/setting-the-default-application-icon-image-in-java-swing-on-os-x

	        frame.setTitle("EnterMedia Boat");
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

	public void init(String[] args )
	{
		String server = args[0];
		String username = args[1];
		String key = args[2];
		
		getConfig().put("username", username);
		getConfig().put("server", server);
		//check  for key
		getConfig().put("key", key);
		getConfig().save();

		//createAndShowGUI();
		connect(server,username,key);

	}
	
	

	protected void openAbsPath(String path)
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
		if( fieldLoginForm == null)
		{
			return false;
		}
		return model == null || getModel().getServer() == null || getModel().getServer().startsWith("http:");
	}


	public void replacedDesktop(JSONObject inMap)
	{
		String desktopid = (String)inMap.get("desktopid");
		String message = "New client connected to server. " + desktopid;
		JOptionPane.showMessageDialog(getLoginForm(),  message, "Logout",JOptionPane.ERROR_MESSAGE);
		createAndShowGUI();

	}


	public void openAsset(JSONObject inMap)
	{
		String finalpath = getModel().downloadFile( inMap);
	
		openAbsPath(finalpath);
		
	}

	public void downloadAsset(JSONObject inMap)
	{
		String finalpath = getModel().downloadFile( inMap);
		openAbsPath(finalpath);
	}
	

	public void uploadAsset(JSONObject inCommand)
	{
		getModel().uploadAsset(inCommand);
		
	}
	
	public void onTextMessage(WebSocket inWebsocket, String inMessage) throws Exception
	{
		try
		{
			JSONObject map = (JSONObject)getModel().getConnection().getJSONParser().parse(new StringReader(inMessage));
			String command = (String)map.get("command");
			debug("received " + command );
			if( "authenticated".equals( command))
			{
				String value = (String)map.get("entermedia.key");
				loginComplete(value);
				getModel().getConnection().autoreconnect = true;
				//getConfig().put("entermedia.key", value);
			}
			else if( "renew_completed".equals( command))
			{
				String value = (String)map.get("entermedia.key");
				loginComplete(value);
				renewKeyLater(); //10hours later
			}
			else if( "authenticatefail".equals( command))
			{
				String value = (String)map.get("reason");
				getModel().getConnection().autoreconnect = false;
				getModel().getConnection().disconnect();
				loginFailed(value);
				
				//getConfig().put("entermedia.key", value);
			}
			else if( "downloadasset".equals( command))
			{
				downloadAsset(map);
			}
			else if( "openasset".equals( command))
			{
				openAsset(map);
			}
			else if( "downloadcategory".equals( command))
			{
				downloadFolders(map);
			}
			else if( "opencategorypath".equals( command))
			{
				String path = (String)map.get("categorypath");
				String abs = getModel().getWorkFolder() + "/" + path;
				openAbsPath(abs);

			}
			else if( "downloadcollection".equals( command))
			{
				downloadFolders(map);
			}
			else if( "checkincollection".equals( command))
			{
				checkinFiles(map);
			}
			else if( "newclientconnect".equals( command))
			{
				disconnect(map);
			}
			else if( "openremotefolder".equals( command))
			{
				cmdOpenFolder(map);
			}
			else if( "replaceddesktop".equals( command))
			{
				replacedDesktop(map);
			}
			else if( "singleupload".equals( command))
			{
				uploadAsset(map);
			}
			else if( "addlocalfilestocache".equals( command))
			{
				String absrootfolder = (String)map.get("abspath");
				getModel().listLocalFilesToCache(map,absrootfolder);
			}
			else if( "gettoplevelfolders".equals( command))
			{
				getModel().getTopLevelFolders(map);
			}
			
		} catch (Throwable ex)
		{
	 		//throw new RuntimeException(ex);
			reportError("Message problem", ex);
		}
	}
	
}
